import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { AppError } from "@/core/errors";
import { can, toPermissionSet } from "@/core/rbac";
import { createOrganization } from "@/modules/identity/services";
import { createClient } from "@/modules/portfolio/clients";
import { createProject } from "@/modules/portfolio/projects";
import { createActivity, updateActivityProgress } from "@/modules/schedule/activities";
import { listBaselines, getBaseline, createBaseline, transitionBaseline, deleteBaseline } from "@/modules/schedule/baselines";
import { listActivities } from "@/modules/schedule/selectors";
import { recalculateSchedule } from "@/modules/schedule/cpm";

// Baseline SCHEDULE (E07-US04, §28) + forecast persistido (E07-US05).

const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

let orgA: { id: string };
let orgB: { id: string };
let userA: { id: string; email: string };
let userB: { id: string; email: string };
let projectId: string;
let firstActivityId: string;
let approvedBaselineId: string;

function actorA() {
  return {
    organizationId: orgA.id,
    actorId: userA.id,
    actorLabel: userA.email,
  };
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

beforeAll(async () => {
  const passwordHash = await hashPassword("Test@1234");
  userA = await prisma.user.create({
    data: { email: `bl-a-${suffix}@test.local`, name: "Baseline A", passwordHash },
  });
  userB = await prisma.user.create({
    data: { email: `bl-b-${suffix}@test.local`, name: "Baseline B", passwordHash },
  });

  orgA = await createOrganization({
    name: `Org Baseline A ${suffix}`,
    slug: `bl-a-${suffix}`,
    actorId: userA.id,
    actorEmail: userA.email,
  });
  orgB = await createOrganization({
    name: `Org Baseline B ${suffix}`,
    slug: `bl-b-${suffix}`,
    actorId: userB.id,
    actorEmail: userB.email,
  });

  const client = await createClient({
    ...actorA(),
    code: `CLI-${suffix.toUpperCase()}`,
    name: "Cliente Baseline",
  });
  const project = await createProject({
    ...actorA(),
    code: `PRJ-${suffix.toUpperCase()}`,
    name: "Projeto Baseline",
    clientId: client.id,
    status: "ACTIVE",
    startDate: "2026-01-05",
  });
  projectId = project.id;

  const activity = await createActivity({
    ...actorA(),
    projectId,
    name: "Fundações",
    duration: 3,
    plannedStart: "2026-01-05",
    plannedFinish: "2026-01-07",
  });
  firstActivityId = activity.id;
}, 60000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("forecast persistido (E07-US05)", () => {
  it("recálculo grava forecastStart/forecastFinish na atividade", async () => {
    const cpm = await recalculateSchedule(orgA.id, projectId);
    const node = cpm.nodes.find((candidate) => candidate.id === firstActivityId)!;

    expect(node.forecastStart).toBeTruthy();
    expect(node.forecastFinish).toBeTruthy();
    expect(cpm.forecastFinish).toBeTruthy();

    const [row] = await listActivities(orgA.id, projectId);
    expect(row.forecastStart).toBe(node.forecastStart);
    expect(row.forecastFinish).toBe(node.forecastFinish);
  });

  it("avanço dispara recálculo do forecast", async () => {
    await updateActivityProgress({
      ...actorA(),
      activityId: firstActivityId,
      physicalProgress: 50,
      status: "IN_PROGRESS",
    });

    const [row] = await listActivities(orgA.id, projectId);
    expect(row.status).toBe("IN_PROGRESS");
    expect(row.physicalProgress).toBe(50);
    // Início real = agora ⇒ forecast começa no dia corrido de hoje (dia útil ou
    // adiado para o próximo dia útil).
    expect(row.forecastStart).toBeTruthy();
    expect(row.forecastFinish! >= row.forecastStart!).toBe(true);
  });
});

describe("ciclo de vida da baseline (E07-US04)", () => {
  it("cria snapshot DRAFT com versão 1 e cópia das atividades", async () => {
    const baseline = await createBaseline({
      ...actorA(),
      projectId,
      reason: "Baseline inicial",
    });
    expect(baseline.version).toBe(1);
    expect(baseline.status).toBe("DRAFT");
    expect(baseline.activityCount).toBe(1);
    expect(baseline.capturedAt).toBeTruthy();

    const full = await getBaseline(orgA.id, baseline.id);
    const snapshot = full.snapshot as { activities: { id: string }[] };
    expect(snapshot.activities.map((activity) => activity.id)).toContain(firstActivityId);
  });

  it("fluxo DRAFT → SUBMITTED → APPROVE", async () => {
    const [draft] = await listBaselines(orgA.id, projectId);

    const submitted = await transitionBaseline({
      ...actorA(),
      baselineId: draft.id,
      action: "SUBMIT",
    });
    expect(submitted.status).toBe("SUBMITTED");

    const approved = await transitionBaseline({
      ...actorA(),
      baselineId: draft.id,
      action: "APPROVE",
    });
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedAt).toBeTruthy();
    approvedBaselineId = approved.id;
  });

  it("SUBMITTED aceita REJECT de volta para DRAFT", async () => {
    const baseline = await createBaseline({ ...actorA(), projectId });
    expect(baseline.version).toBe(2);

    await transitionBaseline({ ...actorA(), baselineId: baseline.id, action: "SUBMIT" });
    const rejected = await transitionBaseline({ ...actorA(), baselineId: baseline.id, action: "REJECT" });
    expect(rejected.status).toBe("DRAFT");

    await deleteBaseline({ ...actorA(), baselineId: baseline.id });
  });

  it("aprovar uma mais nova substitui (SUPERSEDED) a aprovada anterior", async () => {
    const baseline = await createBaseline({ ...actorA(), projectId });
    await transitionBaseline({ ...actorA(), baselineId: baseline.id, action: "SUBMIT" });
    await transitionBaseline({ ...actorA(), baselineId: baseline.id, action: "APPROVE" });

    const previous = await getBaseline(orgA.id, approvedBaselineId);
    expect(previous.status).toBe("SUPERSEDED");
    approvedBaselineId = baseline.id;
  });

  it("transição inválida é rejeitada", async () => {
    const baseline = await createBaseline({ ...actorA(), projectId });
    // REJECT só é válido a partir de SUBMITTED.
    await expectAppError(
      transitionBaseline({ ...actorA(), baselineId: baseline.id, action: "REJECT" }),
      "VALIDATION_ERROR"
    );
    await deleteBaseline({ ...actorA(), baselineId: baseline.id });
  });
});

describe("imutabilidade da baseline aprovada (§28)", () => {
  it("excluir APPROVED responde BASELINE_IMMUTABLE", async () => {
    await expectAppError(
      deleteBaseline({ ...actorA(), baselineId: approvedBaselineId }),
      "BASELINE_IMMUTABLE"
    );
  });

  it("transição de APPROVED/SUPERSEDED responde BASELINE_IMMUTABLE", async () => {
    await expectAppError(
      transitionBaseline({ ...actorA(), baselineId: approvedBaselineId, action: "SUBMIT" }),
      "BASELINE_IMMUTABLE"
    );
  });

  it("o snapshot não muda quando o cronograma muda", async () => {
    const before = await getBaseline(orgA.id, approvedBaselineId);
    const beforeSnapshot = before.snapshot as { activities: unknown[] };
    const beforeCount = beforeSnapshot.activities.length;

    await createActivity({ ...actorA(), projectId, name: "Pós-baseline", duration: 2 });

    const after = await getBaseline(orgA.id, approvedBaselineId);
    const afterSnapshot = after.snapshot as { activities: unknown[] };
    expect(afterSnapshot.activities.length).toBe(beforeCount);
    expect(after.activityCount).toBe(beforeCount);
  });
});

describe("permissão e isolamento — baseline", () => {
  it("SCHEDULE:VIEW não concede APPROVE", () => {
    expect(can(toPermissionSet(["SCHEDULE:VIEW"]), "SCHEDULE", "APPROVE")).toBe(false);
    expect(can(toPermissionSet(["SCHEDULE:APPROVE"]), "SCHEDULE", "APPROVE")).toBe(true);
    expect(can(toPermissionSet(["SCHEDULE:VIEW"]), "SCHEDULE", "CREATE")).toBe(false);
    expect(can(toPermissionSet(["SCHEDULE:CREATE"]), "SCHEDULE", "CREATE")).toBe(true);
  });

  it("leitura/exclusão de baseline de outro tenant é NOT_FOUND", async () => {
    await expectAppError(getBaseline(orgB.id, approvedBaselineId), "NOT_FOUND");
    await expectAppError(deleteBaseline({ ...actorA(), organizationId: orgB.id, baselineId: approvedBaselineId }), "NOT_FOUND");
    await expectAppError(listBaselines(orgB.id, projectId), "NOT_FOUND");
  });
});
