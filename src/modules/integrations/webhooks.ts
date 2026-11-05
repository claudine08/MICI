import { randomBytes, createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import type { ActorContext } from "@/modules/field/common";

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
  const maxAttempts = 3;
  let attempts = delivery.attempts;
  let lastError: string | null = null;
  for (let i = attempts; i < maxAttempts; i++) {
    attempts += 1;
    try {
      const res = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-MICI-Signature": sign(endpoint.secret, body),
          "X-MICI-Delivery": deliveryId,
        },
        body,
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        await prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: { status: "DELIVERED", attempts, deliveredAt: new Date(), lastError: null },
        });
        return;
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
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
 * Dispatcher chamado pelo cron: processa domain_events PENDING e entrega
 * para os endpoints ativos cujo filtro de eventos case (ou lista vazia = todos).
 */
export async function dispatchPendingWebhooks(batchSize = 50) {
  const events = await prisma.domainEvent.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });

  let processed = 0;
  for (const event of events) {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(event.organizationId ? { organizationId: event.organizationId } : {}),
      },
    });

    const targets = endpoints.filter((ep) => {
      const evs = ep.events ?? [];
      return evs.length === 0 || evs.includes(event.eventType);
    });

    for (const endpoint of targets) {
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

    await prisma.domainEvent.update({
      where: { id: event.id },
      data: { status: "PROCESSED", processedAt: new Date(), attempts: event.attempts + 1 },
    });
    processed += 1;
  }
  return { processed };
}