import { randomBytes, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { AppError } from "@/core/errors";
import { createOrganization } from "@/modules/identity/services";
import { createProject } from "@/modules/portfolio/projects";
import { createSustainabilityPlan, transitionSustainabilityPlan, deleteSustainabilityPlan } from "@/modules/sustainability/plans";
import { createSustainabilityMetric, deleteSustainabilityMetric } from "@/modules/sustainability/metrics";
import { createSustainabilityBaseline, deleteSustainabilityBaseline } from "@/modules/sustainability/baselines";
import { createSustainabilityTarget, deleteSustainabilityTarget } from "@/modules/sustainability/targets";
import { createSustainabilityMeasurement, deleteSustainabilityMeasurement } from "@/modules/sustainability/measurements";
import { createWasteRecord, deleteWasteRecord } from "@/modules/sustainability/wastes";

const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

let orgA: { id: string };
let orgB: { id: string };
let userA: { id: string; email: string };
let userB: { id: string; email: string };
let projectId: string;
let otherProjectId: string;

function actorA() { return { organizationId: orgA.id, actorId: userA.id, actorLabel: userA.email }; }
function actorB() { return { organizationId: orgB.id, actorId: userB.id, actorLabel: userB.email }; }

async function expectAppError(promise: Promise<unknown>, code: string): Promise<AppError> {
  try { await promise; } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return error as AppError;
  }
  throw new Error(`Esperava AppError "${code}".`);
}

beforeAll(async () => {
  const passwordHash = await hashPassword("Test@1234");
  userA = await prisma.user.create({ data: { email: `sus-a-${suffix}@test.local`, name: "SUS A", passwordHash } });
  userB = await prisma.user.create({ data: { email: `sus-b-${suffix}@test.local`, name: "SUS B", passwordHash } });
  orgA = await createOrganization({ name: `Org SUS A ${suffix}`, slug: `sus-a-${suffix}`, actorId: userA.id, actorEmail: userA.email });
  orgB = await createOrganization({ name: `Org SUS B ${suffix}`, slug: `sus-b-${suffix}`, actorId: userB.id, actorEmail: userB.email });
  const project = await createProject({ ...actorA(), code: `PRJ-SUS-${suffix.toUpperCase()}`, name: "Projeto SUS Teste" });
  projectId = project.id;
  const otherProject = await createProject({ ...actorB(), code: `PRJ-SUSO-${suffix.toUpperCase()}`, name: "Outro Projeto Org B" });
  otherProjectId = otherProject.id;
});

describe("Sustainability (E16) — integração", () => {
  let planId: string;
  let metricId: string;

  it("cria plano SP001", async () => {
    const plan = await createSustainabilityPlan({ ...actorA(), projectId, title: "Plano PSP" });
    expect(plan.code).toBe("SP001");
    expect(plan.status).toBe("DRAFT");
    planId = plan.id;
  });

  it("idempotência por clientUuid (plano)", async () => {
    const uuid = randomUUID();
    const a = await createSustainabilityPlan({ ...actorA(), projectId, title: "Plano idemp", clientUuid: uuid });
    const b = await createSustainabilityPlan({ ...actorA(), projectId, title: "Plano idemp 2", clientUuid: uuid });
    expect(b.id).toBe(a.id);
  });

  it("transição DRAFT→ACTIVE", async () => {
    const plan = await transitionSustainabilityPlan({ ...actorA(), planId, action: "ACTIVATE" });
    expect(plan.status).toBe("ACTIVE");
  });

  it("cria métrica SM001", async () => {
    const metric = await createSustainabilityMetric({ ...actorA(), projectId, name: "Consumo de água", unit: "m3", planId });
    expect(metric.code).toBe("SM001");
    metricId = metric.id;
  });

  it("idempotência por clientUuid (métrica)", async () => {
    const uuid = randomUUID();
    const a = await createSustainabilityMetric({ ...actorA(), projectId, name: "Métrica idemp", unit: "kg", clientUuid: uuid });
    const b = await createSustainabilityMetric({ ...actorA(), projectId, name: "Métrica idemp 2", unit: "kg", clientUuid: uuid });
    expect(b.id).toBe(a.id);
  });

  it("cria baseline SB001", async () => {
    const baseline = await createSustainabilityBaseline({ ...actorA(), projectId, metricId, value: 100, recordedAt: "2026-11-02", source: "medicao inicial" });
    expect(baseline.code).toBe("SB001");
  });

  it("cria meta ST001", async () => {
    const target = await createSustainabilityTarget({ ...actorA(), projectId, metricId, targetValue: 80, dueDate: "2026-12-31" });
    expect(target.code).toBe("ST001");
  });

  it("cria medição MS001", async () => {
    const measurement = await createSustainabilityMeasurement({ ...actorA(), projectId, metricId, value: 90, measuredAt: "2026-11-02" });
    expect(measurement.code).toBe("MS001");
  });

  it("cria resíduo WR001", async () => {
    const waste = await createWasteRecord({ ...actorA(), projectId, wasteType: "Entulho", quantity: 5, unit: "m3", recordedAt: "2026-11-02" });
    expect(waste.code).toBe("WR001");
  });

  it("tenant isolation: org B não acessa plano de org A", async () => {
    await expectAppError(
      (async () => { await transitionSustainabilityPlan({ ...actorB(), planId, action: "CANCEL", reason: "x" }); })(),
      "NOT_FOUND"
    );
  });

  it("exclusão de plano em DRAFT", async () => {
    const p = await createSustainabilityPlan({ ...actorA(), projectId, title: "Para excluir" });
    await deleteSustainabilityPlan({ ...actorA(), planId: p.id });
    const found = await prisma.sustainabilityPlan.findFirst({ where: { id: p.id } });
    expect(found?.deletedAt).not.toBeNull();
  });

  it("exclusão de métrica", async () => {
    const m = await createSustainabilityMetric({ ...actorA(), projectId, name: "Para excluir", unit: "kg" });
    await deleteSustainabilityMetric({ ...actorA(), metricId: m.id });
    const found = await prisma.sustainabilityMetric.findFirst({ where: { id: m.id } });
    expect(found?.deletedAt).not.toBeNull();
  });
});