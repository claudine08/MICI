import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { AppError } from "@/core/errors";
import { createOrganization } from "@/modules/identity/services";
import { createProject } from "@/modules/portfolio/projects";
import { enqueueDomainEvent } from "@/core/events";
import {
  createWebhookEndpoint,
  dispatchPendingEvents,
  getWebhookEndpoint,
  listWebhookDeliveries,
  listWebhookEndpoints,
} from "@/modules/integrations/webhooks";
import { circuitState, resetIsolation } from "@/modules/integrations/isolation";

const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

const ENV_KEYS = ["WEBHOOKS_ENABLED", "INTEGRATION_CIRCUIT_THRESHOLD"];

let savedEnv: Record<string, string | undefined>;

let orgA: { id: string };
let orgB: { id: string };
let userA: { id: string; email: string };
let userB: { id: string; email: string };
let projectId: string;

function actorA() {
  return { organizationId: orgA.id, actorId: userA.id, actorLabel: userA.email };
}

async function expectAppError(promise: Promise<unknown>, code: string): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return error as AppError;
  }
  throw new Error(`Esperava AppError "${code}", mas a operação concluiu.`);
}

interface CapturedCall {
  url: string;
  init?: RequestInit;
}

function stubFetch(impl?: (url: string, init?: RequestInit) => Promise<unknown>) {
  const captured: CapturedCall[] = [];
  const mock = vi.fn(async (url: unknown, init?: RequestInit) => {
    const target = String(url);
    captured.push({ url: target, init });
    if (impl) return impl(target, init);
    return { ok: true, status: 200 };
  });
  vi.stubGlobal("fetch", mock);
  return { captured, mock };
}

/** Esvazia o outbox acumulado de execuções anteriores (MICI_TEST_NO_RESET=1). */
async function drainEvents(maxIterations = 20, batchSize = 500) {
  for (let i = 0; i < maxIterations; i += 1) {
    const result = await dispatchPendingEvents(batchSize);
    if (result.processed + result.skipped === 0) return;
  }
}

beforeAll(async () => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];

  // Backlog de execuções anteriores (MICI_TEST_NO_RESET=1): esvazia o outbox
  // com fetch stubado para os testes começarem com fila limpa.
  stubFetch();
  await drainEvents(50, 500);

  const passwordHash = await hashPassword("Test@1234");
  userA = await prisma.user.create({
    data: { email: `wh-a-${suffix}@test.local`, name: "Wh A", passwordHash },
  });
  userB = await prisma.user.create({
    data: { email: `wh-b-${suffix}@test.local`, name: "Wh B", passwordHash },
  });

  orgA = await createOrganization({
    name: `Org Wh A ${suffix}`,
    slug: `wh-a-${suffix}`,
    actorId: userA.id,
    actorEmail: userA.email,
  });
  orgB = await createOrganization({
    name: `Org Wh B ${suffix}`,
    slug: `wh-b-${suffix}`,
    actorId: userB.id,
    actorEmail: userB.email,
  });

  const project = await createProject({
    ...actorA(),
    code: `PRJ-WH-${suffix.toUpperCase()}`,
    name: "Projeto Webhooks Teste",
  });
  projectId = project.id;
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetIsolation();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("webhooks outbound (integrações)", () => {
  it("endpoints e entregas são isolados por organização", async () => {
    const endpoint = await createWebhookEndpoint({
      ...actorA(),
      url: "https://exemplo.teste/hook-a",
      events: [],
    });

    await expectAppError(getWebhookEndpoint(orgB.id, endpoint.id), "NOT_FOUND");

    const listB = await listWebhookEndpoints(orgB.id);
    expect(listB.some((e) => e.id === endpoint.id)).toBe(false);

    const deliveriesB = await listWebhookDeliveries(orgB.id);
    expect(deliveriesB.some((d) => d.endpointId === endpoint.id)).toBe(false);
  });

  it("dispatcher entrega com assinatura HMAC e reivindica o evento uma única vez", async () => {
    const { captured } = stubFetch();
    await drainEvents();

    const endpoint = await createWebhookEndpoint({
      ...actorA(),
      url: "https://exemplo.teste/hook",
      events: [],
    });
    const eventId = await enqueueDomainEvent({
      organizationId: orgA.id,
      eventType: "Test.Dispatched",
      aggregateType: "Project",
      aggregateId: projectId,
    });

    await dispatchPendingEvents();

    const delivery = await prisma.webhookDelivery.findFirst({
      where: { eventId, endpointId: endpoint.id },
    });
    expect(delivery).not.toBeNull();
    expect(delivery!.status).toBe("DELIVERED");

    const calls = captured.filter((c) => c.url === "https://exemplo.teste/hook");
    expect(calls).toHaveLength(1);
    const headers = (calls[0].init?.headers ?? {}) as Record<string, string>;
    expect(headers["X-MICI-Signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(headers["X-MICI-Delivery"]).toBe(delivery!.id);

    // Corrida: um segundo dispatcher não reprocessa o mesmo evento.
    await dispatchPendingEvents();
    const count = await prisma.webhookDelivery.count({
      where: { eventId, endpointId: endpoint.id },
    });
    expect(count).toBe(1);

    const event = await prisma.domainEvent.findUnique({ where: { id: eventId } });
    expect(event!.status).toBe("PROCESSED");
  });

  it("evento sem organização é drenado sem vazar para endpoints de tenant", async () => {
    stubFetch();
    await drainEvents();

    const eventId = await enqueueDomainEvent({
      eventType: "System.Boot",
      aggregateType: "System",
      aggregateId: randomUUID(),
    });

    await dispatchPendingEvents();

    const delivery = await prisma.webhookDelivery.findFirst({ where: { eventId } });
    expect(delivery).toBeNull();

    const event = await prisma.domainEvent.findUnique({ where: { id: eventId } });
    expect(event!.status).toBe("PROCESSED");
  });

  it("WEBHOOKS_ENABLED=0 drena eventos sem criar entregas", async () => {
    stubFetch();
    await drainEvents();
    process.env.WEBHOOKS_ENABLED = "0";

    const endpoint = await createWebhookEndpoint({
      ...actorA(),
      url: "https://exemplo.teste/hook-desligado",
      events: [],
    });
    const eventId = await enqueueDomainEvent({
      organizationId: orgA.id,
      eventType: "Test.Desligado",
      aggregateType: "Project",
      aggregateId: projectId,
    });

    await dispatchPendingEvents();

    const delivery = await prisma.webhookDelivery.findFirst({
      where: { eventId, endpointId: endpoint.id },
    });
    expect(delivery).toBeNull();
    const event = await prisma.domainEvent.findUnique({ where: { id: eventId } });
    expect(event!.status).toBe("PROCESSED");
  });

  it("falhas consecutivas abrem o circuito do endpoint e param novas chamadas", async () => {
    let failing = false;
    const { mock } = stubFetch(async () => {
      if (failing) throw new Error("ECONNREFUSED");
      return { ok: true, status: 200 };
    });
    await drainEvents();

    failing = true;
    process.env.INTEGRATION_CIRCUIT_THRESHOLD = "2";
    const target = "https://caido.teste/hook";
    const callsTo = (url: string) => mock.mock.calls.filter((call) => String(call[0]) === url).length;

    const endpoint = await createWebhookEndpoint({ ...actorA(), url: target, events: [] });

    const firstEvent = await enqueueDomainEvent({
      organizationId: orgA.id,
      eventType: "Test.Caiu1",
      aggregateType: "Project",
      aggregateId: projectId,
    });
    await dispatchPendingEvents();

    const delivery = await prisma.webhookDelivery.findFirst({
      where: { eventId: firstEvent, endpointId: endpoint.id },
    });
    expect(delivery).not.toBeNull();
    expect(delivery!.status).toBe("FAILED");
    expect(callsTo(target)).toBe(2); // 3ª tentativa nem sai: circuito aberto
    expect(circuitState(`webhook:${endpoint.id}`)).toBe("open");

    // Endpoint com circuito aberto é ignorado, mas o evento é drenado.
    const secondEvent = await enqueueDomainEvent({
      organizationId: orgA.id,
      eventType: "Test.Caiu2",
      aggregateType: "Project",
      aggregateId: projectId,
    });
    await dispatchPendingEvents();

    expect(callsTo(target)).toBe(2); // nenhuma nova chamada
    const skipped = await prisma.webhookDelivery.findFirst({
      where: { eventId: secondEvent, endpointId: endpoint.id },
    });
    expect(skipped).toBeNull();
    const event = await prisma.domainEvent.findUnique({ where: { id: secondEvent } });
    expect(event!.status).toBe("PROCESSED");
  });
});
