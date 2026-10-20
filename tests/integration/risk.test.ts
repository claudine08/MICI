// Registro de riscos (E10, §32): código RI001, exposure derivado, ciclo
// Identify → … → Close, CANCEL/PLAN/CLOSE obrigatórios, risco residual,
// imutabilidade terminal, histórico de respostas, matriz configurável
// (E10-US02), resumos (E10-US04) e isolamento de tenant.

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { AppError } from "@/core/errors";
import { createOrganization } from "@/modules/identity/services";
import { createClient } from "@/modules/portfolio/clients";
import { createProject } from "@/modules/portfolio/projects";
import { createWbsNode } from "@/modules/wbs/wbs";
import { createActivity } from "@/modules/schedule/activities";
import { createCostItem } from "@/modules/cost/items";
import {
  createRisk,
  updateRisk,
  deleteRisk,
  transitionRisk,
  addRiskResponse,
} from "@/modules/risk/risks";
import {
  listRisks,
  getRiskRow,
  listRiskResponses,
  listRiskSummaries,
} from "@/modules/risk/selectors";
import {
  upsertRiskMatrixConfig,
  getRiskMatrixView,
} from "@/modules/risk/matrix";

const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

let orgA: { id: string };
let orgB: { id: string };
let userA: { id: string; email: string };
let userB: { id: string; email: string };
let projectId: string;
let wbsNodeId: string;
let activityId: string;
let costItemId: string;

function actorA() {
  return { organizationId: orgA.id, actorId: userA.id, actorLabel: userA.email };
}

function actorB() {
  return { organizationId: orgB.id, actorId: userB.id, actorLabel: userB.email };
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
    data: { email: `risk-a-${suffix}@test.local`, name: "Risk A", passwordHash },
  });
  userB = await prisma.user.create({
    data: { email: `risk-b-${suffix}@test.local`, name: "Risk B", passwordHash },
  });

  orgA = await createOrganization({
    name: `Org Risk A ${suffix}`,
    slug: `risk-a-${suffix}`,
    actorId: userA.id,
    actorEmail: userA.email,
  });
  orgB = await createOrganization({
    name: `Org Risk B ${suffix}`,
    slug: `risk-b-${suffix}`,
    actorId: userB.id,
    actorEmail: userB.email,
  });

  const client = await createClient({
    ...actorA(),
    code: `CLI-${suffix.toUpperCase()}`,
    name: "Cliente Riscos",
  });
  const project = await createProject({
    ...actorA(),
    code: `PRJ-${suffix.toUpperCase()}`,
    name: "Projeto Riscos",
    clientId: client.id,
    status: "ACTIVE",
  });
  projectId = project.id;

  const node = await createWbsNode({ ...actorA(), projectId, code: "1", name: "Execução" });
  wbsNodeId = node.id;

  const activity = await createActivity({
    ...actorA(),
    projectId,
    name: "Fundações",
    duration: 3,
    plannedStart: "2026-01-05",
    plannedFinish: "2026-01-07",
  });
  activityId = activity.id;

  const item = await createCostItem({
    ...actorA(),
    projectId,
    description: "Alvenaria",
    category: "Execução",
    unit: "m2",
    quantity: 10,
    unitPrice: 100,
  });
  costItemId = item.id;
}, 60000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("criação de riscos (E10-US01)", () => {
  it("cria risco, deriva exposure e devolve código RI001", async () => {
    const risk = await createRisk({
      ...actorA(),
      projectId,
      title: "Atraso de entrega de material",
      category: "SCHEDULE",
      probability: 3,
      impact: 4,
      wbsNodeId,
      activityId,
      costItemId,
    });

    expect(risk.code).toBe("RI001");
    expect(risk.exposure).toBe(12);
    expect(risk.status).toBe("IDENTIFIED");

    const row = await getRiskRow(orgA.id, risk.id);
    expect(row.level).toBe("HIGH");
    expect(row.wbsNodeCode).toBe("1");
    expect(row.activityCode).toBe("A001");
    expect(row.costItemCode).toBe("CI001");
    expect(row.responseCount).toBe(0);
  });

  it("emite Risk.Identified no domain event", async () => {
    const risk = await createRisk({
      ...actorA(),
      projectId,
      title: "Escopo não congelado",
      category: "SCOPE",
    });

    const event = await prisma.domainEvent.findFirst({
      where: { eventType: "Risk.Identified", aggregateId: risk.id },
    });
    expect(event).not.toBeNull();
    expect(event!.projectId).toBe(projectId);
  });

  it("emite Risk.Escalated para risco crítico (5×5)", async () => {
    const risk = await createRisk({
      ...actorA(),
      projectId,
      title: "Queda do ambiente produtivo",
      category: "SAFETY",
      probability: 5,
      impact: 5,
    });

    expect(risk.exposure).toBe(25);
    const event = await prisma.domainEvent.findFirst({
      where: { eventType: "Risk.Escalated", aggregateId: risk.id },
    });
    expect(event).not.toBeNull();
  });

  it("aceita vínculos válidos de WBS, atividade e custo", async () => {
    const risk = await createRisk({
      ...actorA(),
      projectId,
      title: "Risco com vínculos",
      category: "SAFETY",
      wbsNodeId,
      activityId,
      costItemId,
    });
    const row = await getRiskRow(orgA.id, risk.id);
    expect(row.wbsNodeId).toBe(wbsNodeId);
    expect(row.activityId).toBe(activityId);
    expect(row.costItemId).toBe(costItemId);
  });

  it("rejeita nó de WBS de outro projeto", async () => {
    const other = await createProject({
      ...actorA(),
      code: `PRJ2-${suffix.toUpperCase()}`,
      name: "Outro Projeto",
      status: "ACTIVE",
    });
    const foreignNode = await createWbsNode({
      ...actorA(),
      projectId: other.id,
      code: "1",
      name: "Alheio",
    });

    await expectAppError(
      createRisk({
        ...actorA(),
        projectId,
        title: "Vínculo inválido",
        category: "SAFETY",
        wbsNodeId: foreignNode.id,
      }),
      "VALIDATION_ERROR"
    );
  });

  it("rejeita responsável que não é membro ativo", async () => {
    await expectAppError(
      createRisk({
        ...actorA(),
        projectId,
        title: "Responsável inválido",
        category: "REGULATORY",
        ownerId: userB.id,
      }),
      "VALIDATION_ERROR"
    );
  });

  it("rejeita código duplicado no mesmo projeto", async () => {
    await createRisk({ ...actorA(), projectId, code: "RI-DUP", title: "Original", category: "SCOPE" });
    await expectAppError(
      createRisk({ ...actorA(), projectId, code: "RI-DUP", title: "Duplicado", category: "SCOPE" }),
      "CONFLICT"
    );
  });
});

describe("ciclo de vida (E10-US01/US03/US04)", () => {
  it("CANCEL exige motivo e o risco cancelado fica imutável", async () => {
    const risk = await createRisk({
      ...actorA(),
      projectId,
      title: "Cancelável",
      category: "SCOPE",
    });

    await expectAppError(
      transitionRisk({ ...actorA(), riskId: risk.id, action: "CANCEL" }),
      "VALIDATION_ERROR"
    );

    const cancelled = await transitionRisk({
      ...actorA(),
      riskId: risk.id,
      action: "CANCEL",
      reason: "Fora do escopo do contrato",
    });
    expect(cancelled.status).toBe("CANCELLED");

    await expectAppError(
      updateRisk({ ...actorA(), riskId: risk.id, title: "Tentativa de edição" }),
      "RISK_INVALID_STATE"
    );
    await expectAppError(
      transitionRisk({ ...actorA(), riskId: risk.id, action: "ANALYZE" }),
      "RISK_INVALID_STATE"
    );
  });

  it("PLAN exige estratégia, tratamento e proprietário; grava RiskResponse", async () => {
    const risk = await createRisk({
      ...actorA(),
      projectId,
      title: "Planejável",
      category: "SCHEDULE",
    });
    await transitionRisk({ ...actorA(), riskId: risk.id, action: "ANALYZE" });

    await expectAppError(
      transitionRisk({ ...actorA(), riskId: risk.id, action: "PLAN" }),
      "VALIDATION_ERROR"
    );

    const planned = await transitionRisk({
      ...actorA(),
      riskId: risk.id,
      action: "PLAN",
      response: "MITIGATE",
      treatment: "Antecipar pedido de material",
      ownerId: userA.id,
      dueDate: "2026-12-31",
    });
    expect(planned.status).toBe("PLANNED");
    expect(planned.response).toBe("MITIGATE");

    const responses = await listRiskResponses(orgA.id, risk.id);
    expect(responses).toHaveLength(1);
    expect(responses[0].strategy).toBe("MITIGATE");
    expect(responses[0].ownerName).toBe("Risk A");
  });

  it("percorre o ciclo completo até CLOSE com risco residual", async () => {
    const risk = await createRisk({
      ...actorA(),
      projectId,
      title: "Ciclo completo",
      category: "SAFETY",
      probability: 4,
      impact: 4,
    });
    expect(risk.exposure).toBe(16);

    await transitionRisk({ ...actorA(), riskId: risk.id, action: "ANALYZE" });
    await transitionRisk({
      ...actorA(),
      riskId: risk.id,
      action: "PLAN",
      response: "MITIGATE",
      treatment: "Dupla checagem de deploy",
      ownerId: userA.id,
    });
    await transitionRisk({ ...actorA(), riskId: risk.id, action: "IMPLEMENT" });
    await transitionRisk({ ...actorA(), riskId: risk.id, action: "MONITOR" });

    await expectAppError(
      transitionRisk({ ...actorA(), riskId: risk.id, action: "CLOSE" }),
      "VALIDATION_ERROR"
    );

    const closed = await transitionRisk({
      ...actorA(),
      riskId: risk.id,
      action: "CLOSE",
      residualProbability: 2,
      residualImpact: 2,
      residualNotes: "Implantado o checklist",
    });
    expect(closed.status).toBe("CLOSED");
    expect(closed.residualExposure).toBe(4);
    expect(closed.closedAt).not.toBeNull();

    const row = await getRiskRow(orgA.id, risk.id);
    expect(row.residualLevel).toBe("LOW");
    expect(row.isOpen).toBe(false);

    const event = await prisma.domainEvent.findFirst({
      where: { eventType: "Risk.Closed", aggregateId: risk.id },
    });
    expect(event).not.toBeNull();

    await expectAppError(
      deleteRisk({ ...actorA(), riskId: risk.id }),
      "RISK_INVALID_STATE"
    );
    await expectAppError(
      transitionRisk({ ...actorA(), riskId: risk.id, action: "ANALYZE" }),
      "RISK_INVALID_STATE"
    );
  });

  it("REOPEN devolve risco encerrado ao monitoramento", async () => {
    const risk = await createRisk({
      ...actorA(),
      projectId,
      title: "Reaberto",
      category: "REGULATORY",
    });
    await transitionRisk({ ...actorA(), riskId: risk.id, action: "ANALYZE" });
    await transitionRisk({
      ...actorA(),
      riskId: risk.id,
      action: "PLAN",
      response: "ACCEPT",
      treatment: "Aceitação formal",
      ownerId: userA.id,
    });
    await transitionRisk({ ...actorA(), riskId: risk.id, action: "IMPLEMENT" });
    await transitionRisk({ ...actorA(), riskId: risk.id, action: "MONITOR" });
    await transitionRisk({
      ...actorA(),
      riskId: risk.id,
      action: "CLOSE",
      residualProbability: 1,
      residualImpact: 1,
    });

    const reopened = await transitionRisk({ ...actorA(), riskId: risk.id, action: "REOPEN" });
    expect(reopened.status).toBe("MONITORING");
    expect(reopened.closedAt).toBeNull();

    const retratado = await transitionRisk({
      ...actorA(),
      riskId: risk.id,
      action: "TREAT",
      reason: "Indicador voltou a subir",
    });
    expect(retratado.status).toBe("TREATING");
    expect((await listRiskResponses(orgA.id, risk.id)).length).toBeGreaterThanOrEqual(2);
  });

  it("transições ilegais devolvem RISK_INVALID_STATE", async () => {
    const risk = await createRisk({
      ...actorA(),
      projectId,
      title: "Transição ilegal",
      category: "SCOPE",
    });
    await expectAppError(
      transitionRisk({ ...actorA(), riskId: risk.id, action: "CLOSE" }),
      "RISK_INVALID_STATE"
    );
    await expectAppError(
      transitionRisk({ ...actorA(), riskId: risk.id, action: "IMPLEMENT" }),
      "RISK_INVALID_STATE"
    );
  });

  it("exclusão lógica some o risco vivo", async () => {
    const risk = await createRisk({
      ...actorA(),
      projectId,
      title: "Descartável",
      category: "SCOPE",
    });
    await deleteRisk({ ...actorA(), riskId: risk.id });

    await expectAppError(getRiskRow(orgA.id, risk.id), "NOT_FOUND");
    const rows = await listRisks(orgA.id, projectId);
    expect(rows.some((row) => row.id === risk.id)).toBe(false);
  });
});

describe("histórico de respostas (E10-US03)", () => {
  it("addRiskResponse atualiza o risco e registra histórico", async () => {
    const risk = await createRisk({
      ...actorA(),
      projectId,
      title: "Revisar plano",
      category: "SCHEDULE",
      response: "MITIGATE",
      action: "Plano inicial",
    });

    const updated = await addRiskResponse({
      ...actorA(),
      riskId: risk.id,
      strategy: "TRANSFER",
      action: "Transferir para fornecedor",
      ownerId: userA.id,
      notes: "Revisado com compras",
    });
    expect(updated!.response).toBe("TRANSFER");
    expect(updated!.action).toBe("Transferir para fornecedor");

    const responses = await listRiskResponses(orgA.id, risk.id);
    expect(responses).toHaveLength(1);
    expect(responses[0].strategy).toBe("TRANSFER");
  });

  it("risco terminal não aceita novas respostas", async () => {
    const risk = await createRisk({
      ...actorA(),
      projectId,
      title: "Terminal",
      category: "SCOPE",
    });
    await transitionRisk({ ...actorA(), riskId: risk.id, action: "CANCEL", reason: "Duplicado" });

    await expectAppError(
      addRiskResponse({ ...actorA(), riskId: risk.id, strategy: "ACCEPT" }),
      "RISK_INVALID_STATE"
    );
  });
});

describe("resumo por projeto (E10-US04)", () => {
  it("agrega total, abertos, altos/críticos e atrasados", async () => {
    await createRisk({
      ...actorA(),
      projectId,
      title: "Atrasado",
      category: "SCHEDULE",
      probability: 2,
      impact: 2,
      dueDate: "2020-01-01",
    });

    const summaries = await listRiskSummaries(orgA.id);
    const summary = summaries.find((row) => row.projectId === projectId)!;

    const rows = await listRisks(orgA.id, projectId);
    expect(summary.totalCount).toBe(rows.length);
    expect(summary.openCount).toBe(rows.filter((row) => row.isOpen).length);
    expect(summary.criticalCount).toBe(
      rows.filter((row) => row.isOpen && row.level === "CRITICAL").length
    );
    expect(summary.highCount).toBe(
      rows.filter((row) => row.isOpen && row.level === "HIGH").length
    );
    expect(summary.overdueCount).toBeGreaterThanOrEqual(1);
  });
});

describe("matriz configurável (E10-US02)", () => {
  it("parte do default e muda os níveis após o upsert", async () => {
    const before = await getRiskMatrixView(orgA.id);
    expect(before.isCustom).toBe(false);
    expect(before.lowMax).toBe(4);

    const exposure8 = await createRisk({
      ...actorA(),
      projectId,
      title: "Exposição 8",
      category: "SAFETY",
      probability: 2,
      impact: 4,
    });
    expect(exposure8.exposure).toBe(8);
    const defaultRow = await getRiskRow(orgA.id, exposure8.id);
    expect(defaultRow.level).toBe("MEDIUM");

    await upsertRiskMatrixConfig({
      ...actorA(),
      probabilityLabels: ["Rara", "Improvável", "Possível", "Provável", "Quase certa"],
      impactLabels: ["Insignificante", "Menor", "Moderado", "Maior", "Severo"],
      lowMax: 2,
      mediumMax: 6,
      highMax: 12,
    });

    const after = await getRiskMatrixView(orgA.id);
    expect(after.isCustom).toBe(true);
    expect(after.probabilityLabels).toHaveLength(5);
    expect(after.highMax).toBe(12);

    const customRow = await getRiskRow(orgA.id, exposure8.id);
    expect(customRow.level).toBe("HIGH");
  });

  it("respeita os limites customizados nos resumos", async () => {
    const summaries = await listRiskSummaries(orgA.id);
    const summary = summaries.find((row) => row.projectId === projectId)!;
    const rows = await listRisks(orgA.id, projectId);

    expect(summary.highCount).toBe(
      rows.filter((row) => row.isOpen && row.level === "HIGH").length
    );
    expect(summary.criticalCount).toBe(
      rows.filter((row) => row.isOpen && row.level === "CRITICAL").length
    );
    // Com 2/6/12, exposure 16 (risco do ciclo completo) é CRITICAL.
    const sixteen = rows.find((row) => row.exposure === 16);
    if (sixteen && sixteen.isOpen) expect(sixteen.level).toBe("CRITICAL");
  });
});

describe("isolamento de tenant nos riscos", () => {
  it("não enxerga riscos de outra organização", async () => {
    const rows = await listRisks(orgA.id, projectId);
    expect(rows.length).toBeGreaterThan(0);

    await expectAppError(listRisks(orgB.id, projectId), "NOT_FOUND");
    await expectAppError(getRiskRow(orgB.id, rows[0].id), "NOT_FOUND");
  });

  it("não cria risco no projeto de outra organização", async () => {
    await expectAppError(
      createRisk({
        ...actorB(),
        projectId,
        title: "Invasão",
        category: "REGULATORY",
      }),
      "NOT_FOUND"
    );
  });

  it("não altera respostas de risco alheio", async () => {
    const [risk] = await listRisks(orgA.id, projectId);
    await expectAppError(
      addRiskResponse({ ...actorB(), riskId: risk.id, strategy: "ACCEPT" }),
      "NOT_FOUND"
    );
    await expectAppError(
      transitionRisk({ ...actorB(), riskId: risk.id, action: "ANALYZE" }),
      "NOT_FOUND"
    );
  });

  it("matriz é por organização — orgB segue no default", async () => {
    const view = await getRiskMatrixView(orgB.id);
    expect(view.isCustom).toBe(false);
    expect(view.lowMax).toBe(4);
  });
});
