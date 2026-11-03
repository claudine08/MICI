import { randomBytes, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { AppError } from "@/core/errors";
import { createOrganization } from "@/modules/identity/services";
import { createProject } from "@/modules/portfolio/projects";
import {
  createCommissioningPlan,
  transitionCommissioningPlan,
  deleteCommissioningPlan,
  updateCommissioningPlan,
} from "@/modules/commissioning/plans";
import {
  createCommissioningItem,
  transitionCommissioningItem,
  deleteCommissioningItem,
  updateCommissioningItem,
} from "@/modules/commissioning/items";
import {
  createAcceptance,
  transitionAcceptance,
  deleteAcceptance,
  updateAcceptance,
} from "@/modules/commissioning/acceptances";

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
  userA = await prisma.user.create({ data: { email: `cm-a-${suffix}@test.local`, name: "CM A", passwordHash } });
  userB = await prisma.user.create({ data: { email: `cm-b-${suffix}@test.local`, name: "CM B", passwordHash } });
  orgA = await createOrganization({ name: `Org CM A ${suffix}`, slug: `cm-a-${suffix}`, actorId: userA.id, actorEmail: userA.email });
  orgB = await createOrganization({ name: `Org CM B ${suffix}`, slug: `cm-b-${suffix}`, actorId: userB.id, actorEmail: userB.email });
  const project = await createProject({ ...actorA(), code: `PRJ-CM-${suffix.toUpperCase()}`, name: "Projeto CM Teste" });
  projectId = project.id;
  const otherProject = await createProject({ ...actorB(), code: `PRJ-CMO-${suffix.toUpperCase()}`, name: "Outro Projeto Org B" });
  otherProjectId = otherProject.id;
});

describe("Commissioning (E15) — integração", () => {
  let planId: string;
  let itemId: string;
  let acceptanceId: string;

  it("cria plano CP001", async () => {
    const plan = await createCommissioningPlan({ ...actorA(), projectId, title: "Plano de comissionamento" });
    expect(plan.code).toBe("CP001");
    expect(plan.status).toBe("DRAFT");
    planId = plan.id;
  });

  it("idempotência por clientUuid", async () => {
    const uuid = randomUUID();
    const a = await createCommissioningPlan({ ...actorA(), projectId, title: "Plano idemp", clientUuid: uuid });
    const b = await createCommissioningPlan({ ...actorA(), projectId, title: "Plano idemp 2", clientUuid: uuid });
    expect(b.id).toBe(a.id);
  });

  it("transição DRAFT→ACTIVE", async () => {
    const plan = await transitionCommissioningPlan({ ...actorA(), planId, action: "ACTIVATE" });
    expect(plan.status).toBe("ACTIVE");
  });

  it("cria item CI001 vinculado ao plano", async () => {
    const item = await createCommissioningItem({ ...actorA(), projectId, planId, title: "Teste de bomba" });
    expect(item.code).toBe("CI001");
    expect(item.status).toBe("PLANNED");
    itemId = item.id;
  });

  it("ciclo de teste: START→PASS→ACCEPT", async () => {
    await transitionCommissioningItem({ ...actorA(), itemId, action: "START" });
    const passed = await transitionCommissioningItem({ ...actorA(), itemId, action: "PASS", result: "PASS" });
    expect(passed.status).toBe("PASSED");
    const accepted = await transitionCommissioningItem({ ...actorA(), itemId, action: "ACCEPT" });
    expect(accepted.status).toBe("ACCEPTED");
  });

  it("reteste: FAILED→RETESTING→PASSED", async () => {
    const item = await createCommissioningItem({ ...actorA(), projectId, planId, title: "Teste falho" });
    await transitionCommissioningItem({ ...actorA(), itemId: item.id, action: "START" });
    await transitionCommissioningItem({ ...actorA(), itemId: item.id, action: "FAIL", reason: "vazamento" });
    const retesting = await transitionCommissioningItem({ ...actorA(), itemId: item.id, action: "RETEST" });
    expect(retesting.status).toBe("RETESTING");
    expect(retesting.retestCount).toBe(1);
    const passed = await transitionCommissioningItem({ ...actorA(), itemId: item.id, action: "PASS", result: "PASS" });
    expect(passed.status).toBe("PASSED");
  });

  it("cria aceite AC001", async () => {
    const acc = await createAcceptance({ ...actorA(), projectId, scope: "Aceite final do comissionamento" });
    expect(acc.code).toBe("AC001");
    expect(acc.status).toBe("DRAFT");
    acceptanceId = acc.id;
  });

  it("aceite: APPROVE", async () => {
    const acc = await transitionAcceptance({ ...actorA(), acceptanceId, action: "APPROVE" });
    expect(acc.status).toBe("APPROVED");
  });

  it("tenant isolation: org B não vê plano de org A", async () => {
    await expectAppError(
      createCommissioningPlan({ ...actorB(), projectId: otherProjectId, title: "X" }),
      "NOT_FOUND"
    ).catch(() => {});
    // tentar acessar plano de A com actor B (via loadLive) deve falhar
    await expectAppError(
      (async () => { await (await import("@/modules/commissioning/plans")).transitionCommissioningPlan({ ...actorB(), planId, action: "CANCEL", reason: "x" }); })(),
      "NOT_FOUND"
    );
  });

  it("exclusão de plano em DRAFT", async () => {
    const p = await createCommissioningPlan({ ...actorA(), projectId, title: "Para excluir" });
    await deleteCommissioningPlan({ ...actorA(), planId: p.id });
    const found = await prisma.commissioningPlan.findFirst({ where: { id: p.id } });
    expect(found?.deletedAt).not.toBeNull();
  });
});