import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import {
  isRiskTerminal,
  nextRiskStatus,
  riskExposure,
  riskLevel,
  type RiskAction,
  type RiskCategory,
  type RiskResponseStrategy,
} from "@/modules/risk/engine";
import { assertRiskProject, getEffectiveRiskMatrix } from "@/modules/risk/selectors";

// Registro de riscos (E10, §32): causa/evento/efeito, probabilidade ×
// impacto, proprietário, resposta, ação, prazo, status e residual.
// `exposure`/`residualExposure` são DERIVADOS (prob × impacto) e sempre
// recalculados pelo motor antes de persistir; nível é calculado na leitura.

interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

function toDate(value: string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  return new Date(`${value}T00:00:00.000Z`);
}

function audit(
  input: ActorContext,
  projectId: string,
  action: string,
  data: { objectId: string; oldValue?: unknown; newValue?: unknown; reason?: string | null }
) {
  return prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      projectId,
      objectType: "Risk",
      objectId: data.objectId,
      action,
      ...(data.oldValue !== undefined ? { oldValue: data.oldValue as never } : {}),
      ...(data.newValue !== undefined ? { newValue: data.newValue as never } : {}),
      reason: data.reason ?? null,
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });
}

async function emitDomainEvent(
  input: ActorContext,
  projectId: string,
  eventType: string,
  riskId: string,
  payload: Record<string, unknown>
) {
  await prisma.domainEvent.create({
    data: {
      organizationId: input.organizationId,
      projectId,
      actorId: input.actorId,
      eventType,
      aggregateType: "Risk",
      aggregateId: riskId,
      payload: payload as never,
    },
  });
}

async function assertOwner(organizationId: string, ownerId: string) {
  const membership = await prisma.organizationMembership.findFirst({
    where: { organizationId, userId: ownerId, status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  if (!membership) {
    throw new AppError("VALIDATION_ERROR", "Responsável não é membro ativo desta organização.");
  }
}

async function assertRiskLinks(
  organizationId: string,
  projectId: string,
  links: { wbsNodeId?: string | null; activityId?: string | null; costItemId?: string | null }
) {
  if (links.wbsNodeId) {
    const node = await prisma.wBSNode.findFirst({
      where: { id: links.wbsNodeId, organizationId, projectId, deletedAt: null },
      select: { id: true },
    });
    if (!node) {
      throw new AppError("VALIDATION_ERROR", "Nó de WBS inválido para este projeto.");
    }
  }
  if (links.activityId) {
    const activity = await prisma.scheduleActivity.findFirst({
      where: { id: links.activityId, organizationId, projectId, deletedAt: null },
      select: { id: true },
    });
    if (!activity) {
      throw new AppError("VALIDATION_ERROR", "Atividade inválida para este projeto.");
    }
  }
  if (links.costItemId) {
    const item = await prisma.costItem.findFirst({
      where: { id: links.costItemId, organizationId, projectId, deletedAt: null },
      select: { id: true },
    });
    if (!item) {
      throw new AppError("VALIDATION_ERROR", "Item de custo inválido para este projeto.");
    }
  }
}

async function nextRiskCode(projectId: string): Promise<string> {
  const risks = await prisma.risk.findMany({
    where: { projectId },
    select: { code: true },
  });
  let max = 0;
  for (const { code } of risks) {
    const match = /^RI(\d+)$/.exec(code);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `RI${String(max + 1).padStart(3, "0")}`;
}

async function loadLiveRisk(organizationId: string, riskId: string) {
  const risk = await prisma.risk.findFirst({
    where: { id: riskId, organizationId, deletedAt: null },
  });
  if (!risk) {
    throw new AppError("NOT_FOUND", "Risco não encontrado nesta organização.");
  }
  return risk;
}

// Emite Risk.Escalated quando o nível do risco vira CRITICAL (§52/§53).
async function emitIfEscalated(
  input: ActorContext,
  risk: { id: string; projectId: string; code: string; exposure: number },
  previousExposure: number | null
) {
  const matrix = await getEffectiveRiskMatrix(input.organizationId);
  const before = previousExposure === null ? null : riskLevel(previousExposure, matrix);
  const after = riskLevel(risk.exposure, matrix);
  if (after === "CRITICAL" && before !== "CRITICAL") {
    await emitDomainEvent(input, risk.projectId, "Risk.Escalated", risk.id, {
      code: risk.code,
      exposure: risk.exposure,
      level: after,
    });
  }
}

export interface CreateRiskInput {
  projectId: string;
  code?: string;
  title: string;
  cause?: string;
  event?: string;
  effect?: string;
  category: RiskCategory;
  probability?: number;
  impact?: number;
  ownerId?: string | null;
  response?: RiskResponseStrategy | null;
  action?: string;
  dueDate?: string;
  wbsNodeId?: string | null;
  activityId?: string | null;
  costItemId?: string | null;
}

export async function createRisk(input: ActorContext & CreateRiskInput) {
  await assertRiskProject(input.organizationId, input.projectId);
  if (input.ownerId) await assertOwner(input.organizationId, input.ownerId);
  await assertRiskLinks(input.organizationId, input.projectId, {
    wbsNodeId: input.wbsNodeId,
    activityId: input.activityId,
    costItemId: input.costItemId,
  });

  let code = input.code?.trim();
  if (code) {
    const existing = await prisma.risk.findFirst({
      where: { projectId: input.projectId, code },
      select: { id: true },
    });
    if (existing) {
      throw new AppError("CONFLICT", `Código de risco "${code}" já existe no projeto.`);
    }
  } else {
    code = await nextRiskCode(input.projectId);
  }

  const probability = input.probability ?? 1;
  const impact = input.impact ?? 1;
  const exposure = riskExposure(probability, impact);

  const risk = await prisma.risk.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      code,
      title: input.title.trim(),
      cause: input.cause?.trim() || null,
      event: input.event?.trim() || null,
      effect: input.effect?.trim() || null,
      category: input.category,
      probability,
      impact,
      exposure,
      ownerId: input.ownerId ?? null,
      response: input.response ?? null,
      action: input.action?.trim() || null,
      dueDate: toDate(input.dueDate),
      wbsNodeId: input.wbsNodeId ?? null,
      activityId: input.activityId ?? null,
      costItemId: input.costItemId ?? null,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });

  await audit(input, input.projectId, "CREATE", {
    objectId: risk.id,
    newValue: { code: risk.code, title: risk.title, exposure: risk.exposure },
  });
  await emitDomainEvent(input, input.projectId, "Risk.Identified", risk.id, {
    code: risk.code,
    category: risk.category,
    exposure: risk.exposure,
  });
  await emitIfEscalated(input, risk, null);

  return risk;
}

export interface UpdateRiskInput {
  riskId: string;
  code?: string;
  title?: string;
  cause?: string;
  event?: string;
  effect?: string;
  category?: RiskCategory;
  probability?: number;
  impact?: number;
  ownerId?: string | null;
  response?: RiskResponseStrategy | null;
  action?: string;
  dueDate?: string;
  wbsNodeId?: string | null;
  activityId?: string | null;
  costItemId?: string | null;
}

// Risco fechado/cancelado é histórico — para alterar, use REOPEN.
export async function updateRisk(input: ActorContext & UpdateRiskInput) {
  const risk = await loadLiveRisk(input.organizationId, input.riskId);

  if (isRiskTerminal(risk.status)) {
    throw new AppError(
      "RISK_INVALID_STATE",
      `Risco ${risk.status === "CLOSED" ? "encerrado" : "cancelado"} é imutável — reabra para alterar.`
    );
  }

  if (input.ownerId) await assertOwner(input.organizationId, input.ownerId);
  if (
    input.wbsNodeId !== undefined ||
    input.activityId !== undefined ||
    input.costItemId !== undefined
  ) {
    await assertRiskLinks(input.organizationId, risk.projectId, {
      wbsNodeId: input.wbsNodeId !== undefined ? input.wbsNodeId : risk.wbsNodeId,
      activityId: input.activityId !== undefined ? input.activityId : risk.activityId,
      costItemId: input.costItemId !== undefined ? input.costItemId : risk.costItemId,
    });
  }
  if (input.code !== undefined && input.code.trim() !== risk.code) {
    const existing = await prisma.risk.findFirst({
      where: { projectId: risk.projectId, code: input.code.trim() },
      select: { id: true },
    });
    if (existing) {
      throw new AppError("CONFLICT", `Código de risco "${input.code.trim()}" já existe no projeto.`);
    }
  }

  const probability = input.probability ?? risk.probability;
  const impact = input.impact ?? risk.impact;
  const exposure = riskExposure(probability, impact);

  const updated = await prisma.risk.update({
    where: { id: risk.id },
    data: {
      ...(input.code !== undefined ? { code: input.code.trim() } : {}),
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.cause !== undefined ? { cause: input.cause.trim() || null } : {}),
      ...(input.event !== undefined ? { event: input.event.trim() || null } : {}),
      ...(input.effect !== undefined ? { effect: input.effect.trim() || null } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
      ...(input.response !== undefined ? { response: input.response } : {}),
      ...(input.action !== undefined ? { action: input.action.trim() || null } : {}),
      ...(input.dueDate !== undefined ? { dueDate: toDate(input.dueDate) ?? null } : {}),
      ...(input.wbsNodeId !== undefined ? { wbsNodeId: input.wbsNodeId } : {}),
      ...(input.activityId !== undefined ? { activityId: input.activityId } : {}),
      ...(input.costItemId !== undefined ? { costItemId: input.costItemId } : {}),
      probability,
      impact,
      exposure,
      updatedBy: input.actorId,
      version: { increment: 1 },
    },
  });

  await audit(input, risk.projectId, "UPDATE", {
    objectId: risk.id,
    oldValue: { exposure: risk.exposure, status: risk.status },
    newValue: { exposure: updated.exposure, status: updated.status },
  });
  await emitIfEscalated(input, updated, risk.exposure);

  return updated;
}

// Exclusão lógica; risco encerrado é histórico e não some (BR de auditoria).
export async function deleteRisk(input: ActorContext & { riskId: string }) {
  const risk = await loadLiveRisk(input.organizationId, input.riskId);

  if (risk.status === "CLOSED") {
    throw new AppError("RISK_INVALID_STATE", "Risco encerrado não pode ser excluído (histórico).");
  }

  await prisma.risk.update({
    where: { id: risk.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId },
  });

  await audit(input, risk.projectId, "DELETE", {
    objectId: risk.id,
    oldValue: { code: risk.code, title: risk.title, status: risk.status },
  });

  return { riskId: risk.id };
}

export interface RiskTransitionInput {
  riskId: string;
  action: RiskAction;
  reason?: string;
  response?: RiskResponseStrategy;
  treatment?: string;
  ownerId?: string;
  dueDate?: string;
  residualProbability?: number;
  residualImpact?: number;
  residualNotes?: string;
}

// Transição do ciclo §32 (Identify → Analyze → Response → Implement →
// Monitor → Close). Regras por ação:
// - CANCEL exige motivo;
// - PLAN exige estratégia + ação de tratamento + proprietário (grava
//   histórico RiskResponse — E10-US03);
// - CLOSE exige probabilidade/impacto residual (E10-US04);
// - TREAT (reatuar a partir do monitoramento) registra nota no histórico.
export async function transitionRisk(input: ActorContext & RiskTransitionInput) {
  const risk = await loadLiveRisk(input.organizationId, input.riskId);

  const next = nextRiskStatus(risk.status, input.action);
  if (!next) {
    throw new AppError(
      "RISK_INVALID_STATE",
      `Transição "${input.action}" inválida para o status ${risk.status}.`
    );
  }

  if (input.action === "CANCEL" && !input.reason?.trim()) {
    throw new AppError("VALIDATION_ERROR", "Cancelamento exige um motivo.");
  }

  let responsePayload: {
    strategy: RiskResponseStrategy;
    action: string | null;
    ownerId: string | null;
    dueDate: Date | undefined;
    notes: string | null;
  } | null = null;

  if (input.action === "PLAN") {
    const strategy = input.response ?? risk.response;
    const treatment = input.treatment?.trim() ?? risk.action?.trim() ?? "";
    const ownerId = input.ownerId ?? risk.ownerId;
    if (!strategy) {
      throw new AppError("VALIDATION_ERROR", "Planejamento exige a estratégia de resposta.");
    }
    if (!treatment) {
      throw new AppError("VALIDATION_ERROR", "Planejamento exige a ação de tratamento.");
    }
    if (!ownerId) {
      throw new AppError("VALIDATION_ERROR", "Planejamento exige o proprietário do risco.");
    }
    await assertOwner(input.organizationId, ownerId);
    responsePayload = {
      strategy,
      action: treatment,
      ownerId,
      dueDate: toDate(input.dueDate),
      notes: input.reason?.trim() || null,
    };
  }

  if (input.action === "TREAT") {
    if (!risk.response) {
      throw new AppError("VALIDATION_ERROR", "Risco sem estratégia de resposta — planeje antes.");
    }
    if (!input.reason?.trim()) {
      throw new AppError("VALIDATION_ERROR", "Re-tratamento exige uma nota (motivo).");
    }
    responsePayload = {
      strategy: risk.response,
      action: risk.action,
      ownerId: risk.ownerId,
      dueDate: undefined,
      notes: input.reason.trim(),
    };
  }

  if (input.action === "CLOSE") {
    if (input.residualProbability === undefined || input.residualImpact === undefined) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Encerramento exige probabilidade e impacto residual (risco residual, E10-US04)."
      );
    }
  }

  const residualProbability =
    input.residualProbability ?? risk.residualProbability;
  const residualImpact = input.residualImpact ?? risk.residualImpact;
  const residualExposure =
    residualProbability !== null && residualImpact !== null
      ? riskExposure(residualProbability, residualImpact)
      : null;

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    if (responsePayload) {
      await tx.riskResponse.create({
        data: {
          organizationId: input.organizationId,
          projectId: risk.projectId,
          riskId: risk.id,
          strategy: responsePayload.strategy,
          action: responsePayload.action,
          ownerId: responsePayload.ownerId,
          dueDate: responsePayload.dueDate,
          notes: responsePayload.notes,
          createdBy: input.actorId,
        },
      });
    }

    return tx.risk.update({
      where: { id: risk.id },
      data: {
        status: next,
        ...(responsePayload
          ? {
              response: responsePayload.strategy,
              action: responsePayload.action,
              ownerId: responsePayload.ownerId,
              ...(input.dueDate !== undefined
                ? { dueDate: toDate(input.dueDate) ?? null }
                : {}),
            }
          : {}),
        ...(input.action === "ANALYZE" ? { analyzedAt: now } : {}),
        ...(input.action === "CLOSE"
          ? {
              residualProbability,
              residualImpact,
              residualExposure,
              residualNotes: input.residualNotes?.trim() || risk.residualNotes,
              closedAt: now,
              closedBy: input.actorId,
            }
          : {}),
        ...(input.action === "REOPEN" ? { closedAt: null, closedBy: null } : {}),
        updatedBy: input.actorId,
        version: { increment: 1 },
      },
    });
  });

  await audit(input, risk.projectId, input.action, {
    objectId: risk.id,
    oldValue: { status: risk.status },
    newValue: { status: updated.status, ...(residualExposure !== null ? { residualExposure } : {}) },
    reason: input.reason?.trim() ?? null,
  });

  if (input.action === "CLOSE") {
    await emitDomainEvent(input, risk.projectId, "Risk.Closed", risk.id, {
      code: risk.code,
      residualExposure: updated.residualExposure,
    });
  }
  await emitIfEscalated(input, updated, risk.exposure);

  return updated;
}

export interface AddRiskResponseInput {
  riskId: string;
  strategy: RiskResponseStrategy;
  action?: string;
  ownerId?: string | null;
  dueDate?: string;
  notes?: string;
}

// Revê a resposta do risco fora da transição PLAN (ex.: ajustar o plano em
// tratamento/monitoramento): atualiza o risco atual e registra o histórico.
export async function addRiskResponse(input: ActorContext & AddRiskResponseInput) {
  const risk = await loadLiveRisk(input.organizationId, input.riskId);

  if (isRiskTerminal(risk.status)) {
    throw new AppError("RISK_INVALID_STATE", "Risco terminal não aceita novas respostas.");
  }
  if (input.ownerId) await assertOwner(input.organizationId, input.ownerId);

  const action = input.action?.trim() || risk.action;
  const ownerId = input.ownerId !== undefined ? input.ownerId : risk.ownerId;

  await prisma.$transaction(async (tx) => {
    await tx.riskResponse.create({
      data: {
        organizationId: input.organizationId,
        projectId: risk.projectId,
        riskId: risk.id,
        strategy: input.strategy,
        action: action ?? null,
        ownerId: ownerId ?? null,
        dueDate: toDate(input.dueDate),
        notes: input.notes?.trim() || null,
        createdBy: input.actorId,
      },
    });
    await tx.risk.update({
      where: { id: risk.id },
      data: {
        response: input.strategy,
        action: action ?? null,
        ownerId: ownerId ?? null,
        ...(input.dueDate !== undefined ? { dueDate: toDate(input.dueDate) ?? null } : {}),
        updatedBy: input.actorId,
        version: { increment: 1 },
      },
    });
  });

  await audit(input, risk.projectId, "RESPONSE_ADD", {
    objectId: risk.id,
    newValue: { strategy: input.strategy, ownerId: ownerId ?? null },
  });

  return prisma.risk.findUnique({ where: { id: risk.id } });
}
