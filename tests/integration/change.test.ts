// Controle de mudanças (E11, §31): código CR001, workflow obrigatório
// DRAFT → … → CLOSED, análise de impacto por dimensão, aprovação auditada
// (ChangeApproval), baseline revision na implementação (BR-005), imutabilidade
// terminal, resumos e isolamento de tenant.

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { AppError } from "@/core/errors";
import { createOrganization } from "@/modules/identity/services";
import { createProject } from "@/modules/portfolio/projects";
import { createChange, updateChange, deleteChange, transitionChange, upsertChangeImpact } from "@/modules/change/changes";
import {
  listChanges,
  getChangeRow,
  listChangeImpacts,
  listChangeApprovals,
  listChangeSummaries,
} from "@/modules/change/selectors";
import { createBaseline } from "@/modules/schedule/baselines";

const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

let orgA: { id: string };
let orgB: { id: string };
let userA: { id: string; email: string };
let userB: { id: string; email: string };
let projectId: string;

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

// Auxiliar: cria uma mudança e leva até WAITING_APPROVAL com impacto avaliado.
async function createPendingChange(title: string) {
  const change = await createChange({
    ...actorA(),
    projectId,
    title,
    category: "SCHEDULE",
    costDelta: 1500.5,
    scheduleDays: 7,
  });
  await transitionChange({ ...actorA(), changeId: change.id, action: "SUBMIT" });
  await transitionChange({ ...actorA(), changeId: change.id, action: "START_ANALYSIS" });
  await upsertChangeImpact({
    ...actorA(),
    changeId: change.id,
    dimension: "SCHEDULE",
    severity: "HIGH",
    notes: "Atraso de 7 dias na entrega dos equipamentos",
  });
  await transitionChange({ ...actorA(), changeId: change.id, action: "REQUEST_APPROVAL" });
  return change;
}

beforeAll(async () => {
  const passwordHash = await hashPassword("Test@1234");
  userA = await prisma.user.create({
    data: { email: `change-a-${suffix}@test.local`, name: "Change A", passwordHash },
  });
  userB = await prisma.user.create({
    data: { email: `change-b-${suffix}@test.local`, name: "Change B", passwordHash },
  });

  orgA = await createOrganization({
    name: `Org Change A ${suffix}`,
    slug: `change-a-${suffix}`,
    actorId: userA.id,
    actorEmail: userA.email,
  });
  orgB = await createOrganization({
    name: `Org Change B ${suffix}`,
    slug: `change-b-${suffix}`,
    actorId: userB.id,
    actorEmail: userB.email,
  });

  const project = await createProject({
    ...actorA(),
    code: `PRJ-${suffix.toUpperCase()}`,
    name: "Projeto Mudanças",
    status: "ACTIVE",
  });
  projectId = project.id;
}, 60000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("criação de mudanças (E11, §31)", () => {
  it("cria mudança em DRAFT com código CR001 e impacto consolidado", async () => {
    const change = await createChange({
      ...actorA(),
      projectId,
      title: "Ampliar capacidade da câmara fria",
      category: "SCOPE",
      description: "Incluir +20 m³ de câmara fria",
      justification: "Demanda do cliente ampliada",
      costDelta: 25000,
      scheduleDays: 10,
    });

    expect(change.code).toBe("CR001");
    expect(change.status).toBe("DRAFT");
    expect(change.requestedById).toBe(userA.id);
    expect(Number(change.costDelta)).toBe(25000);
    expect(change.scheduleDays).toBe(10);

    const row = await getChangeRow(orgA.id, change.id);
    expect(row.overallSeverity).toBe("NONE");
    expect(row.impactCount).toBe(0);
    expect(row.isOpen).toBe(true);
  });

  it("rejeita código duplicado no mesmo projeto", async () => {
    await createChange({ ...actorA(), projectId, code: "CR-DUP", title: "Original" });
    await expectAppError(
      createChange({ ...actorA(), projectId, code: "CR-DUP", title: "Duplicado" }),
      "CONFLICT"
    );
  });

  it("rejeita responsável que não é membro ativo", async () => {
    await expectAppError(
      createChange({
        ...actorA(),
        projectId,
        title: "Responsável inválido",
        ownerId: userB.id,
      }),
      "VALIDATION_ERROR"
    );
  });
});

describe("workflow obrigatório (§31)", () => {
  it("CANCEL exige motivo e a mudança cancelada fica imutável", async () => {
    const change = await createChange({ ...actorA(), projectId, title: "Cancelável" });

    await expectAppError(
      transitionChange({ ...actorA(), changeId: change.id, action: "CANCEL" }),
      "VALIDATION_ERROR"
    );

    const cancelled = await transitionChange({
      ...actorA(),
      changeId: change.id,
      action: "CANCEL",
      reason: "Não justifica o impacto",
    });
    expect(cancelled.status).toBe("CANCELLED");

    await expectAppError(
      updateChange({ ...actorA(), changeId: change.id, title: "Tentativa de edição" }),
      "CHANGE_INVALID_STATE"
    );
    await expectAppError(
      transitionChange({ ...actorA(), changeId: change.id, action: "SUBMIT" }),
      "CHANGE_INVALID_STATE"
    );
  });

  it("REQUEST_APPROVAL exige ao menos uma dimensão de impacto avaliada", async () => {
    const change = await createChange({ ...actorA(), projectId, title: "Sem impacto" });
    await transitionChange({ ...actorA(), changeId: change.id, action: "SUBMIT" });
    await transitionChange({ ...actorA(), changeId: change.id, action: "START_ANALYSIS" });

    await expectAppError(
      transitionChange({ ...actorA(), changeId: change.id, action: "REQUEST_APPROVAL" }),
      "VALIDATION_ERROR"
    );

    await upsertChangeImpact({
      ...actorA(),
      changeId: change.id,
      dimension: "COST",
      severity: "MEDIUM",
      notes: "Acréscimo moderado de material",
    });
    const pending = await transitionChange({
      ...actorA(),
      changeId: change.id,
      action: "REQUEST_APPROVAL",
    });
    expect(pending.status).toBe("WAITING_APPROVAL");
  });

  it("REJECT exige motivo e grava ChangeApproval REJECT (append-only)", async () => {
    const change = await createPendingChange("Rejeitável");

    await expectAppError(
      transitionChange({ ...actorA(), changeId: change.id, action: "REJECT" }),
      "VALIDATION_ERROR"
    );

    const rejected = await transitionChange({
      ...actorA(),
      changeId: change.id,
      action: "REJECT",
      reason: "Sem orçamento disponível no trimestre",
    });
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.rejectReason).toContain("orçamento");

    const approvals = await listChangeApprovals(orgA.id, change.id);
    expect(approvals).toHaveLength(1);
    expect(approvals[0].action).toBe("REJECT");
    expect(approvals[0].comment).toContain("orçamento");

    await expectAppError(
      transitionChange({ ...actorA(), changeId: change.id, action: "SUBMIT" }),
      "CHANGE_INVALID_STATE"
    );
  });

  it("percorre o ciclo completo APPROVED → IMPLEMENTED → VERIFIED → CLOSED com baseline revision", async () => {
    const change = await createPendingChange("Ciclo completo");
    const baseline = await createBaseline({
      ...actorA(),
      projectId,
      reason: "Baseline anterior à mudança",
    });

    const approved = await transitionChange({
      ...actorA(),
      changeId: change.id,
      action: "APPROVE",
      reason: "Aprovado pelo PMO",
    });
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedAt).not.toBeNull();

    const event = await prisma.domainEvent.findFirst({
      where: { eventType: "Change.Approved", aggregateId: change.id },
    });
    expect(event).not.toBeNull();

    await expectAppError(
      transitionChange({ ...actorA(), changeId: change.id, action: "VERIFY" }),
      "CHANGE_INVALID_STATE"
    );
    await expectAppError(
      transitionChange({
        ...actorA(),
        changeId: change.id,
        action: "IMPLEMENT",
        baselineIds: [baseline.id],
      }),
      "VALIDATION_ERROR"
    );

    const implemented = await transitionChange({
      ...actorA(),
      changeId: change.id,
      action: "IMPLEMENT",
      implementationNotes: "Cronograma replanejado e baseline SCHEDULE v1 revisada",
      baselineIds: [baseline.id],
    });
    expect(implemented.status).toBe("IMPLEMENTED");
    expect(implemented.implementationNotes).toContain("replanejado");

    // BR-005: a baseline fica vinculada à mudança (rastreabilidade).
    const linked = await prisma.baseline.findUnique({ where: { id: baseline.id } });
    expect(linked!.changeRequestId).toBe(change.id);

    const verified = await transitionChange({
      ...actorA(),
      changeId: change.id,
      action: "VERIFY",
      reason: "Conferido no cronograma executivo",
    });
    expect(verified.status).toBe("VERIFIED");

    const closed = await transitionChange({ ...actorA(), changeId: change.id, action: "CLOSE" });
    expect(closed.status).toBe("CLOSED");
    expect(closed.closedAt).not.toBeNull();

    const row = await getChangeRow(orgA.id, change.id);
    expect(row.isOpen).toBe(false);
    expect(row.baselineCount).toBe(1);

    const approvals = await listChangeApprovals(orgA.id, change.id);
    expect(approvals).toHaveLength(1);
    expect(approvals[0].action).toBe("APPROVE");

    // Encerrada é histórico: nem edição, nem exclusão.
    await expectAppError(
      updateChange({ ...actorA(), changeId: change.id, title: "Tentativa" }),
      "CHANGE_INVALID_STATE"
    );
    await expectAppError(
      deleteChange({ ...actorA(), changeId: change.id }),
      "CHANGE_INVALID_STATE"
    );
  });

  it("não vincula baseline já vinculada a outra mudança", async () => {
    const first = await createPendingChange("Primeira mudança");
    const second = await createPendingChange("Segunda mudança");
    const baseline = await createBaseline({ ...actorA(), projectId, reason: "Baseline disputada" });

    await transitionChange({ ...actorA(), changeId: first.id, action: "APPROVE" });
    await transitionChange({
      ...actorA(),
      changeId: first.id,
      action: "IMPLEMENT",
      implementationNotes: "Implementada",
      baselineIds: [baseline.id],
    });

    await transitionChange({ ...actorA(), changeId: second.id, action: "APPROVE" });
    await expectAppError(
      transitionChange({
        ...actorA(),
        changeId: second.id,
        action: "IMPLEMENT",
        implementationNotes: "Tentativa de vínculo",
        baselineIds: [baseline.id],
      }),
      "CONFLICT"
    );
  });

  it("transições ilegais devolvem CHANGE_INVALID_STATE", async () => {
    const change = await createChange({ ...actorA(), projectId, title: "Transição ilegal" });
    await expectAppError(
      transitionChange({ ...actorA(), changeId: change.id, action: "APPROVE" }),
      "CHANGE_INVALID_STATE"
    );
    await expectAppError(
      transitionChange({ ...actorA(), changeId: change.id, action: "IMPLEMENT" }),
      "CHANGE_INVALID_STATE"
    );
  });
});

describe("análise de impacto (§31 ChangeImpact)", () => {
  it("upsert por dimensão com severidade derivada na leitura", async () => {
    const change = await createChange({ ...actorA(), projectId, title: "Multi-dimensão" });

    await upsertChangeImpact({
      ...actorA(),
      changeId: change.id,
      dimension: "QUALITY",
      severity: "LOW",
    });
    await upsertChangeImpact({
      ...actorA(),
      changeId: change.id,
      dimension: "ENVIRONMENTAL",
      severity: "CRITICAL",
      notes: "Efluente acima do permitido",
    });

    const row = await getChangeRow(orgA.id, change.id);
    expect(row.impactCount).toBe(2);
    expect(row.overallSeverity).toBe("CRITICAL");

    // Atualizar a mesma dimensão não duplica.
    await upsertChangeImpact({
      ...actorA(),
      changeId: change.id,
      dimension: "ENVIRONMENTAL",
      severity: "MEDIUM",
      notes: "Reavaliado com o ETE",
    });
    const impacts = await listChangeImpacts(orgA.id, change.id);
    expect(impacts).toHaveLength(2);
    const environmental = impacts.find((impact) => impact.dimension === "ENVIRONMENTAL")!;
    expect(environmental.severity).toBe("MEDIUM");
    expect(environmental.notes).toContain("ETE");

    const rowAfter = await getChangeRow(orgA.id, change.id);
    expect(rowAfter.overallSeverity).toBe("MEDIUM");
  });

  it("não aceita impacto após WAITING_APPROVAL", async () => {
    const change = await createPendingChange("Congelada pós-análise");
    await expectAppError(
      upsertChangeImpact({
        ...actorA(),
        changeId: change.id,
        dimension: "COST",
        severity: "HIGH",
      }),
      "CHANGE_INVALID_STATE"
    );
  });
});

describe("resumo por projeto e isolamento de tenant", () => {
  it("agrega total, abertas, aguardando aprovação, aprovadas, rejeitadas e alto impacto", async () => {
    const summaries = await listChangeSummaries(orgA.id);
    const summary = summaries.find((row) => row.projectId === projectId)!;
    const rows = await listChanges(orgA.id, projectId);

    expect(summary.totalCount).toBe(rows.length);
    expect(summary.openCount).toBe(rows.filter((row) => row.isOpen).length);
    expect(summary.waitingApprovalCount).toBe(
      rows.filter((row) => row.status === "WAITING_APPROVAL").length
    );
    expect(summary.approvedCount).toBe(
      rows.filter((row) => row.status === "APPROVED").length
    );
    expect(summary.rejectedCount).toBe(
      rows.filter((row) => row.status === "REJECTED").length
    );
    expect(summary.highImpactCount).toBe(
      rows.filter((row) => row.overallSeverity === "HIGH" || row.overallSeverity === "CRITICAL")
        .length
    );
    expect(summary.highImpactCount).toBeGreaterThanOrEqual(1);
  });

  it("não enxerga mudanças de outra organização", async () => {
    const rows = await listChanges(orgA.id, projectId);
    expect(rows.length).toBeGreaterThan(0);

    await expectAppError(listChanges(orgB.id, projectId), "NOT_FOUND");
    await expectAppError(getChangeRow(orgB.id, rows[0].id), "NOT_FOUND");
  });

  it("não cria mudança no projeto de outra organização", async () => {
    await expectAppError(
      createChange({ ...actorB(), projectId, title: "Invasão" }),
      "NOT_FOUND"
    );
  });

  it("não altera nem transiciona mudança alheia", async () => {
    const [change] = await listChanges(orgA.id, projectId);
    await expectAppError(
      updateChange({ ...actorB(), changeId: change.id, title: "Apropriação" }),
      "NOT_FOUND"
    );
    await expectAppError(
      transitionChange({ ...actorB(), changeId: change.id, action: "SUBMIT" }),
      "NOT_FOUND"
    );
    await expectAppError(
      upsertChangeImpact({ ...actorB(), changeId: change.id, dimension: "COST", severity: "LOW" }),
      "NOT_FOUND"
    );
  });

  it("exclusão lógica some a mudança rascunho", async () => {
    const change = await createChange({ ...actorA(), projectId, title: "Descartável" });
    await deleteChange({ ...actorA(), changeId: change.id });

    await expectAppError(getChangeRow(orgA.id, change.id), "NOT_FOUND");
    const rows = await listChanges(orgA.id, projectId);
    expect(rows.some((row) => row.id === change.id)).toBe(false);
  });
});
