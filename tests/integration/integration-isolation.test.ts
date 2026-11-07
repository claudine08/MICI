import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { createOrganization } from "@/modules/identity/services";
import { createProject } from "@/modules/portfolio/projects";
import { enqueueDomainEvent } from "@/core/events";
import { createApprovalRequest } from "@/modules/integrations/approvals";
import { enqueueJob, processJobs, registerJobHandler, runJobNow } from "@/modules/integrations/jobs";
import {
  circuitState,
  recordFailure,
  resetIsolation,
} from "@/modules/integrations/isolation";

const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

const ENV_KEYS = [
  "INTEGRATIONS_ENABLED",
  "EMAIL_ENABLED",
  "WHATSAPP_ENABLED",
  "INTEGRATION_CIRCUIT_THRESHOLD",
  "INTEGRATION_CIRCUIT_COOLDOWN_MS",
];

let savedEnv: Record<string, string | undefined>;

let orgA: { id: string };
let userA: { id: string; email: string };
let projectId: string;

function actorA() {
  return { organizationId: orgA.id, actorId: userA.id, actorLabel: userA.email };
}

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetIsolation();
});

beforeAll(async () => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];

  const passwordHash = await hashPassword("Test@1234");
  userA = await prisma.user.create({
    data: { email: `iso-a-${suffix}@test.local`, name: "Iso A", passwordHash },
  });

  orgA = await createOrganization({
    name: `Org Iso A ${suffix}`,
    slug: `iso-a-${suffix}`,
    actorId: userA.id,
    actorEmail: userA.email,
  });

  const project = await createProject({
    ...actorA(),
    code: `PRJ-ISO-${suffix.toUpperCase()}`,
    name: "Projeto Isolamento Teste",
  });
  projectId = project.id;
});

describe("isolamento de falhas — aprovações por e-mail", () => {
  it("cria a aprovação mesmo com o circuito de e-mail aberto e deixa o job na fila", async () => {
    // Simula provedor fora do ar (limiar padrão = 5 falhas consecutivas).
    for (let i = 0; i < 5; i += 1) recordFailure("email");
    expect(circuitState("email")).toBe("open");

    const approval = await createApprovalRequest({
      ...actorA(),
      projectId,
      objectType: "COST_ITEM",
      objectId: randomUUID(),
      approverEmail: `aprovador-${suffix}@test.local`,
      baseUrl: "http://localhost:3000",
    });

    // Núcleo segue funcionando: aprovação criada, sem exceção.
    expect(approval.status).toBe("PENDING");

    // E-mail virou job idempotente; o envio inline foi pulado pelo circuito
    // e o cron tentará novamente quando o circuito reabrir (sem contar retry).
    const job = await prisma.jobQueue.findFirst({
      where: { dedupeKey: `email.approval:${approval.id}` },
    });
    expect(job).not.toBeNull();
    expect(job!.status).toBe("PENDING");
    expect(job!.attempts).toBe(0);
    expect(job!.runAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("criar a mesma aprovação duas vezes não duplica o job de e-mail", async () => {
    const first = await createApprovalRequest({
      ...actorA(),
      projectId,
      objectType: "COST_ITEM",
      objectId: randomUUID(),
      approverEmail: `aprovador2-${suffix}@test.local`,
      baseUrl: "http://localhost:3000",
    });
    const jobs = await prisma.jobQueue.count({
      where: { dedupeKey: `email.approval:${first.id}` },
    });
    expect(jobs).toBe(1);
  });
});

describe("fila de jobs das integrações", () => {
  it("enqueueJob é idempotente por dedupeKey", async () => {
    const dedupeKey = `test-dedupe-${suffix}`;
    const firstId = await enqueueJob({
      type: "email.send",
      payload: { to: "x@test.local", subject: "s", html: "<p>h</p>" },
      dedupeKey,
    });
    const secondId = await enqueueJob({
      type: "email.send",
      payload: { to: "x@test.local", subject: "s", html: "<p>h</p>" },
      dedupeKey,
    });
    expect(firstId).not.toBeNull();
    expect(secondId).toBeNull();

    const count = await prisma.jobQueue.count({ where: { dedupeKey } });
    expect(count).toBe(1);
  });

  it("processJobs entrega e-mail (fallback console) e marca SUCCESS", async () => {
    const jobId = await enqueueJob({
      type: "email.send",
      payload: { to: `proc-${suffix}@test.local`, subject: "Teste", html: "<p>ok</p>" },
      dedupeKey: `test-process-${suffix}`,
    });
    expect(jobId).not.toBeNull();

    const result = await processJobs({ types: ["email.send"], limit: 50 });
    expect(result.succeeded).toBeGreaterThanOrEqual(1);

    const job = await prisma.jobQueue.findUnique({ where: { id: jobId! } });
    expect(job!.status).toBe("SUCCESS");
    expect(job!.lastError).toBeNull();
  });

  it("handler que falha é reagendado com backoff e vira FAILED no limite", async () => {
    registerJobHandler("test.fail", async () => {
      throw new Error("boom");
    });
    const jobId = await enqueueJob({
      type: "test.fail",
      payload: {},
      dedupeKey: `test-fail-${suffix}`,
      maxAttempts: 2,
    });

    await processJobs({ types: ["test.fail"] });
    let job = await prisma.jobQueue.findUnique({ where: { id: jobId! } });
    expect(job!.status).toBe("PENDING"); // primeira falha: retry agendado
    expect(job!.attempts).toBe(1);
    expect(job!.runAt.getTime()).toBeGreaterThan(Date.now());
    expect(job!.lastError).toContain("boom");

    // Força a segunda tentativa (simula o cron futuro).
    await prisma.jobQueue.update({ where: { id: jobId! }, data: { runAt: new Date() } });
    await processJobs({ types: ["test.fail"] });
    job = await prisma.jobQueue.findUnique({ where: { id: jobId! } });
    expect(job!.status).toBe("FAILED");
    expect(job!.attempts).toBe(2);
  });

  it("provedor desabilitado adia o job sem consumir tentativas", async () => {
    process.env.EMAIL_ENABLED = "0";
    const jobId = await enqueueJob({
      type: "email.send",
      payload: { to: `dis-${suffix}@test.local`, subject: "s", html: "<p>h</p>" },
      dedupeKey: `test-disabled-${suffix}`,
    });

    await processJobs({ types: ["email.send"], limit: 50 });
    const job = await prisma.jobQueue.findUnique({ where: { id: jobId! } });
    expect(job!.status).toBe("PENDING"); // continua na fila
    expect(job!.attempts).toBe(0); // não conta tentativa
    expect(job!.runAt.getTime()).toBeGreaterThan(Date.now());
    expect(job!.lastError).toContain("disabled");
  });

  it("whatsapp.notify entrega para membros com telefone (fallback console)", async () => {
    await prisma.user.update({ where: { id: userA.id }, data: { phone: "+5511999990001" } });
    const eventId = await enqueueDomainEvent({
      organizationId: orgA.id,
      eventType: "Test.Notified",
      aggregateType: "Project",
      aggregateId: projectId,
    });
    const jobId = await enqueueJob({
      type: "whatsapp.notify",
      payload: { eventId },
      dedupeKey: `test-notify-${suffix}`,
    });

    // runJobNow reivindica diretamente (imune a backlog da fila); a mecânica
    // de processJobs com backoff já é coberta pelos testes de e-mail.
    const status = await runJobNow(jobId!);
    expect(status).toBe("SUCCESS");

    const job = await prisma.jobQueue.findUnique({ where: { id: jobId! } });
    expect(job!.status).toBe("SUCCESS");
  });
});
