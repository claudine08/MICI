import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { AppError } from "@/core/errors";
import { can, toPermissionSet } from "@/core/rbac";
import { createOrganization } from "@/modules/identity/services";
import { createClient } from "@/modules/portfolio/clients";
import { createProject } from "@/modules/portfolio/projects";
import { createWbsNode } from "@/modules/wbs/wbs";
import {
  createActivity,
  deleteActivity,
  updateActivity,
  updateActivityProgress,
} from "@/modules/schedule/activities";
import { createDependency, deleteDependency } from "@/modules/schedule/dependencies";
import { getSchedule, listActivities, listScheduleSummaries } from "@/modules/schedule/selectors";
import { recalculateSchedule } from "@/modules/schedule/cpm";
import { progressSchema } from "@/modules/schedule/schemas";

// Cronograma (E07, §27) — CRUD de atividades, dependências com ciclo, avanço,
// recálculo do CPM, permissão e isolamento de tenant no CI.

const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

let orgA: { id: string };
let orgB: { id: string };
let userA: { id: string; email: string };
let userB: { id: string; email: string };
let projectId: string;
let firstActivityId: string;
let successorActivityId: string;
let dependencyId: string;

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
    data: { email: `sched-a-${suffix}@test.local`, name: "Schedule A", passwordHash },
  });
  userB = await prisma.user.create({
    data: { email: `sched-b-${suffix}@test.local`, name: "Schedule B", passwordHash },
  });

  orgA = await createOrganization({
    name: `Org Schedule A ${suffix}`,
    slug: `sched-a-${suffix}`,
    actorId: userA.id,
    actorEmail: userA.email,
  });
  orgB = await createOrganization({
    name: `Org Schedule B ${suffix}`,
    slug: `sched-b-${suffix}`,
    actorId: userB.id,
    actorEmail: userB.email,
  });

  const client = await createClient({
    ...actorA(),
    code: `CLI-${suffix.toUpperCase()}`,
    name: "Cliente Cronograma",
  });
  const project = await createProject({
    ...actorA(),
    code: `PRJ-${suffix.toUpperCase()}`,
    name: "Projeto Cronograma",
    clientId: client.id,
    status: "ACTIVE",
    startDate: "2026-01-05",
  });
  projectId = project.id;
}, 60000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("CRUD de atividades (E07-US01)", () => {
  it("cria com código automático A001 e recalcula float/crítico", async () => {
    const activity = await createActivity({
      ...actorA(),
      projectId,
      name: "Fundações",
      duration: 3,
      plannedStart: "2026-01-05",
      plannedFinish: "2026-01-07",
    });
    expect(activity.code).toBe("A001");
    firstActivityId = activity.id;

    const [row] = await listActivities(orgA.id, projectId);
    expect(row.totalFloat).toBe(0);
    expect(row.critical).toBe(true);
  });

  it("código duplicado conflita", async () => {
    await expectAppError(
      createActivity({ ...actorA(), projectId, code: "A001", name: "Duplicada" }),
      "CONFLICT"
    );
  });

  it("marco exige duração 0", async () => {
    const error = await expectAppError(
      createActivity({
        ...actorA(),
        projectId,
        name: "Marco inválido",
        activityType: "MILESTONE",
        duration: 5,
      }),
      "VALIDATION_ERROR"
    );
    expect(error.message).toMatch(/Marco/);
  });

  it("datas invertidas são rejeitadas", async () => {
    await expectAppError(
      createActivity({
        ...actorA(),
        projectId,
        name: "Período inválido",
        plannedStart: "2026-02-10",
        plannedFinish: "2026-02-01",
      }),
      "VALIDATION_ERROR"
    );
  });

  it("vínculo WBS precisa pertencer ao projeto", async () => {
    const node = await createWbsNode({ ...actorA(), projectId, name: "Escopo cronograma" });

    const linked = await createActivity({
      ...actorA(),
      projectId,
      name: "Atividade vinculada",
      wbsNodeId: node.id,
    });
    expect(linked.wbsNodeId).toBe(node.id);

    await expectAppError(
      createActivity({
        ...actorA(),
        projectId,
        name: "WBS órfão",
        wbsNodeId: "00000000-0000-4000-8000-000000000000",
      }),
      "VALIDATION_ERROR"
    );
  });

  it("atualiza campos e registra avanço físico", async () => {
    const updated = await updateActivity({
      ...actorA(),
      activityId: firstActivityId,
      name: "Fundações executadas",
    });
    expect(updated.name).toBe("Fundações executadas");
    expect(updated.version).toBe(2);

    const progress = await updateActivityProgress({
      ...actorA(),
      activityId: firstActivityId,
      physicalProgress: 40,
      status: "IN_PROGRESS",
    });
    expect(progress.physicalProgress).toBe(40);
    expect(progress.status).toBe("IN_PROGRESS");

    const completed = await updateActivityProgress({
      ...actorA(),
      activityId: firstActivityId,
      physicalProgress: 0,
      status: "COMPLETED",
    });
    expect(completed.physicalProgress).toBe(100);
  });

  it("avanço acima de 100% é rejeitado pelo schema", () => {
    const parsed = progressSchema.safeParse({ physicalProgress: 120 });
    expect(parsed.success).toBe(false);
  });
});

describe("dependências e CPM (E07-US02/US06)", () => {
  it("cria sucessora e dependência FS; CPM persiste float/crítico", async () => {
    const successor = await createActivity({
      ...actorA(),
      projectId,
      name: "Alvenaria",
      duration: 2,
    });
    successorActivityId = successor.id;

    const dependency = await createDependency({
      ...actorA(),
      projectId,
      predecessorId: firstActivityId,
      successorId: successorActivityId,
      type: "FS",
    });
    dependencyId = dependency.id;

    const cpm = await recalculateSchedule(orgA.id, projectId);
    const predecessorNode = cpm.nodes.find((node) => node.code === "A001")!;
    const successorNode = cpm.nodes.find((node) => node.id === successorActivityId)!;

    // A001: 05–07/01; sucessora inicia 08/01 e termina 09/01.
    expect(successorNode.earlyStart).toBe("2026-01-08");
    expect(successorNode.earlyFinish).toBe("2026-01-09");
    expect(cpm.projectFinish).toBe("2026-01-09");
    expect(predecessorNode.critical).toBe(true);
    expect(successorNode.critical).toBe(true);

    const rows = await listActivities(orgA.id, projectId);
    const persistedPredecessor = rows.find((row) => row.id === firstActivityId)!;
    const persistedSuccessor = rows.find((row) => row.id === successorActivityId)!;
    expect(persistedPredecessor.totalFloat).toBe(0);
    expect(persistedPredecessor.critical).toBe(true);
    expect(persistedSuccessor.critical).toBe(true);
  });

  it("resumo global por projeto (visão /cronograma)", async () => {
    const summaries = await listScheduleSummaries(orgA.id);
    const summary = summaries.find((row) => row.projectId === projectId)!;
    expect(summary).toBeTruthy();
    expect(summary.activityCount).toBe(3); // A001, A002 + a do teste de WBS
    expect(summary.criticalCount).toBe(2);
    expect(summary.forecastFinish).toBeTruthy(); // ancorado no realizado de A001
    expect(summary.averageProgress).toBeGreaterThanOrEqual(0);
  });

  it("dependência duplicada conflita", async () => {
    await expectAppError(
      createDependency({
        ...actorA(),
        projectId,
        predecessorId: firstActivityId,
        successorId: successorActivityId,
      }),
      "CONFLICT"
    );
  });

  it("ciclo é rejeitado", async () => {
    const error = await expectAppError(
      createDependency({
        ...actorA(),
        projectId,
        predecessorId: successorActivityId,
        successorId: firstActivityId,
        type: "SS",
      }),
      "VALIDATION_ERROR"
    );
    expect(error.message).toMatch(/ciclo/i);
  });

  it("auto-dependência é rejeitada", async () => {
    await expectAppError(
      createDependency({
        ...actorA(),
        projectId,
        predecessorId: firstActivityId,
        successorId: firstActivityId,
      }),
      "VALIDATION_ERROR"
    );
  });

  it("dependência de atividade de outro projeto é rejeitada", async () => {
    await expectAppError(
      createDependency({
        ...actorA(),
        projectId,
        predecessorId: firstActivityId,
        successorId: "00000000-0000-4000-8000-000000000000",
      }),
      "VALIDATION_ERROR"
    );
  });

  it("exclusão da atividade fica bloqueada enquanto houver dependência", async () => {
    const blocked = await expectAppError(
      deleteActivity({ ...actorA(), activityId: firstActivityId }),
      "CONFLICT"
    );
    expect(blocked.message).toMatch(/dependência/i);

    await deleteDependency({ ...actorA(), dependencyId });
    const removed = await deleteActivity({ ...actorA(), activityId: firstActivityId });
    expect(removed.activityId).toBe(firstActivityId);

    const rows = await listActivities(orgA.id, projectId);
    expect(rows.find((row) => row.id === firstActivityId)).toBeUndefined();
  });
});

describe("permissão SCHEDULE", () => {
  it("sem SCHEDULE:VIEW a checagem da rota nega; com ela, permite", () => {
    expect(can(toPermissionSet(["PROJECT:VIEW"]), "SCHEDULE", "VIEW")).toBe(false);
    expect(can(toPermissionSet(["SCHEDULE:VIEW"]), "SCHEDULE", "VIEW")).toBe(true);
    expect(can(toPermissionSet(["SCHEDULE:VIEW"]), "SCHEDULE", "CREATE")).toBe(false);
    expect(can(toPermissionSet(["SCHEDULE:CREATE"]), "SCHEDULE", "CREATE")).toBe(true);
    expect(can(toPermissionSet(["SCHEDULE:VIEW"]), "SCHEDULE", "DELETE")).toBe(false);
  });
});

describe("isolamento de tenant — cronograma", () => {
  it("leitura de cronograma de outro tenant é NOT_FOUND", async () => {
    await expectAppError(getSchedule(orgB.id, projectId), "NOT_FOUND");
    await expectAppError(listActivities(orgB.id, projectId), "NOT_FOUND");
  });

  it("criação em projeto de outro tenant é NOT_FOUND", async () => {
    await expectAppError(
      createActivity({ ...actorA(), organizationId: orgB.id, projectId, name: "Invasora" }),
      "NOT_FOUND"
    );
  });

  it("dependência de outro tenant é NOT_FOUND", async () => {
    await expectAppError(
      deleteDependency({ ...actorA(), organizationId: orgB.id, dependencyId }),
      "NOT_FOUND"
    );
  });
});
