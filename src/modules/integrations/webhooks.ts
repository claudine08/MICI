import { randomBytes, createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { logger } from "@/lib/logger";
import type { ActorContext } from "@/modules/field/common";
import { enqueueJob } from "@/modules/integrations/jobs";
import { circuitState, isProviderEnabled, safeCall } from "@/modules/integrations/isolation";

export interface CreateWebhookInput extends ActorContext {
  url: string;
  secret?: string;
  events?: string[];
  isActive?: boolean;
  description?: string | null;
}

export async function createWebhookEndpoint(input: CreateWebhookInput) {
  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      organizationId: input.organizationId,
      url: input.url,
      secret: input.secret ?? randomBytes(32).toString("hex"),
      events: input.events ?? [],
      isActive: input.isActive ?? true,
      description: input.description ?? null,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });
  return endpoint;
}

export async function listWebhookEndpoints(organizationId: string) {
  return prisma.webhookEndpoint.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { deliveries: true } } },
  });
}

export async function getWebhookEndpoint(organizationId: string, id: string) {
  const endpoint = await prisma.webhookEndpoint.findFirst({
    where: { id, organizationId, deletedAt: null },
  });
  if (!endpoint) throw new AppError("NOT_FOUND", "Webhook não encontrado nesta organização.");
  return endpoint;
}

export async function updateWebhookEndpoint(
  organizationId: string,
  id: string,
  actor: ActorContext,
  patch: {
    url?: string;
    secret?: string;
    events?: string[];
    isActive?: boolean;
    description?: string | null;
  }
) {
  const existing = await getWebhookEndpoint(organizationId, id);
  const updated = await prisma.webhookEndpoint.update({
    where: { id: existing.id },
    data: {
      ...(patch.url !== undefined ? { url: patch.url } : {}),
      ...(patch.secret !== undefined ? { secret: patch.secret } : {}),
      ...(patch.events !== undefined ? { events: patch.events } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      updatedBy: actor.actorId,
    },
  });
  return updated;
}

export async function deleteWebhookEndpoint(organizationId: string, id: string, actor: ActorContext) {
  await getWebhookEndpoint(organizationId, id);
  await prisma.webhookEndpoint.update({
    where: { id },
    data: { deletedAt: new Date(), deletedBy: actor.actorId, isActive: false },
  });
}

export async function listWebhookDeliveries(organizationId: string, endpointId?: string, limit = 50) {
  return prisma.webhookDelivery.findMany({
    where: {
      ...(endpointId ? { endpointId } : {}),
      endpoint: { organizationId, deletedAt: null },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

function sign(secret: string, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

export async function dispatchWebhookTest(organizationId: string, id: string) {
  const endpoint = await getWebhookEndpoint(organizationId, id);
  const payload = { type: "webhook.test", timestamp: new Date().toISOString(), data: { message: "MICI webhook test" } };
  const body = JSON.stringify(payload);
  const delivery = await prisma.webhookDelivery.create({
    data: {
      endpointId: endpoint.id,
      eventType: "webhook.test",
      payload: payload as never,
      status: "PENDING",
    },
  });
  await attemptDelivery(endpoint, delivery.id, body, delivery);
  return prisma.webhookDelivery.findUnique({ where: { id: delivery.id } });
}

async function attemptDelivery(
  endpoint: { id: string; url: string; secret: string },
  deliveryId: string,
  body: string,
  delivery: { attempts: number }
) {
  const key = `webhook:${endpoint.id}`;
  const maxAttempts = 3;
  let attempts = delivery.attempts;
  let lastError: string | null = null;
  for (let i = attempts; i < maxAttempts; i++) {
    attempts += 1;
    // safeCall: timeout + circuit breaker por endpoint; nunca lança.
    const result = await safeCall(
      "webhook",
      key,
      async (signal) => {
        const res = await fetch(endpoint.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-MICI-Signature": sign(endpoint.secret, body),
            "X-MICI-Delivery": deliveryId,
          },
          body,
          signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return true;
      },
      { timeoutMs: 10_000 }
    );
    if (result.status === "ok") {
      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: "DELIVERED", attempts, deliveredAt: new Date(), lastError: null },
      });
      return;
    }
    if (result.status === "skipped") {
      lastError = result.reason === "disabled" ? "WEBHOOKS desabilitado" : "circuito aberto (endpoint instável)";
      break;
    }
    lastError = result.error;
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { attempts, lastError },
    });
    if (i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, 200 * (i + 1)));
    }
  }
  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: { status: "FAILED", lastError },
  });
}

/**
 * Consumidor ÚNICO do outbox domain_events (evita a corrida com outros crons).
 * Reivindica o evento atomicamente (PENDING → PROCESSED) e faz fan-out:
 * - entregas webhook para os endpoints ativos da organização (se habilitado);
 * - job whatsapp.notify para notificar membros com telefone (se habilitado).
 * Eventos sem organização são apenas drenados (não vazam para endpoints de
 * tenant). Se o fan-out falhar, marca FAILED com lastError (visível).
 */
export async function dispatchPendingEvents(batchSize = 50) {
  const events = await prisma.domainEvent.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });

  let processed = 0;
  let skipped = 0;
  for (const event of events) {
    // Reivindicação atômica: se outro worker já tomou o evento, pula.
    const claimed = await prisma.domainEvent.updateMany({
      where: { id: event.id, status: "PENDING" },
      data: { status: "PROCESSED", processedAt: new Date(), attempts: event.attempts + 1 },
    });
    if (claimed.count === 0) {
      skipped += 1;
      continue;
    }

    try {
      if (isProviderEnabled("webhook")) {
        await fanOutWebhooks(event);
      }
      if (event.organizationId && isProviderEnabled("whatsapp")) {
        // Só enfileira se algum membro ativo tiver telefone — sem telefone,
        // o job seria no-op (evita fila crescendo com jobs inúteis).
        const withPhone = await prisma.organizationMembership.findFirst({
          where: {
            organizationId: event.organizationId,
            status: "ACTIVE",
            deletedAt: null,
            user: { phone: { not: null } },
          },
          select: { id: true },
        });
        if (withPhone) {
          await enqueueJob({
            type: "whatsapp.notify",
            dedupeKey: `whatsapp.notify:${event.id}`,
            payload: { eventId: event.id },
          });
        }
      }
      processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.domainEvent
        .updateMany({ where: { id: event.id }, data: { status: "FAILED", lastError: message.slice(0, 500) } })
        .catch(() => undefined);
      logger.error("webhook_dispatch_failed", { eventId: event.id, error: message });
    }
  }
  return { processed, skipped };
}

// Tipagem estrutural do evento (evita depender dos tipos gerados do Prisma).
interface DispatchableEvent {
  id: string;
  organizationId: string | null;
  projectId: string | null;
  eventVersion: number;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  attempts: number;
  createdAt: Date;
}

async function fanOutWebhooks(event: DispatchableEvent) {
  // Segurança multi-tenant: só eventos com organização chegam a endpoints.
  if (!event.organizationId) return;

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { deletedAt: null, isActive: true, organizationId: event.organizationId },
  });

  for (const endpoint of endpoints) {
    const evs = endpoint.events ?? [];
    if (evs.length > 0 && !evs.includes(event.eventType)) continue;
    // Endpoint com circuito aberto (falhas consecutivas) é ignorado nesta
    // rodada em vez de gastar 30s de retry por evento.
    if (circuitState(`webhook:${endpoint.id}`) === "open") {
      logger.warn("webhook_endpoint_circuit_open", { endpointId: endpoint.id, eventId: event.id });
      continue;
    }

    const payload = {
      id: event.id,
      type: event.eventType,
      version: event.eventVersion,
      organizationId: event.organizationId,
      projectId: event.projectId,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload,
      createdAt: event.createdAt.toISOString(),
    };
    const body = JSON.stringify(payload);
    const delivery = await prisma.webhookDelivery.create({
      data: {
        endpointId: endpoint.id,
        eventId: event.id,
        eventType: event.eventType,
        payload: payload as never,
        status: "PENDING",
      },
    });
    await attemptDelivery(endpoint, delivery.id, body, delivery);
  }
}