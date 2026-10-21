import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import {
  isChangeEditable,
  nextChangeStatus,
  type ChangeAction,
  type ChangeDimension,
  type ImpactSeverity,
} from "@/modules/change/engine";
import { assertChangeProject } from "@/modules/change/selectors";

// Mudanças (E11, §31): pedido com workflow obrigatório, análise de impacto
// por dimensão, aprovação auditada e implementação com vínculo de baselines
// (baseline revision — BR-005). Aprovações (ChangeApproval) são append-only.

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
      objectType: "ChangeRequest",
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
  changeId: string,
  payload: Record<string, unknown>
) {
  await prisma.domainEvent.create({
    data: {
      organizationId: input.organizationId,
      projectId,
      actorId: input.actorId,
      eventType,
      aggregateType: "ChangeRequest",
      aggregateId: changeId,
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

async function nextChangeCode(projectId: string): Promise<string> {
  const changes = await prisma.changeRequest.findMany({
    where: { projectId },
    select: { code: true },
  });
  let max = 0;
  for (const { code } of changes) {
    const match = /^CR(\d+)$/.exec(code);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `CR${String(max + 1).padStart(3, "0")}`;
}

async function loadLiveChange(organizationId: string, changeId: string) {
  const change = await prisma.changeRequest.findFirst({
    where: { id: changeId, organizationId, deletedAt: null },
  });
  if (!change) {
    throw new AppError("NOT_FOUND", "Mudança não encontrada nesta organização.");
  }
  return change;
}

export interface CreateChangeInput {
  projectId: string;
  code?: string;
  title: string;
  description?: string;
  justification?: string;
  category?: ChangeDimension;
  ownerId?: string | null;
  dueDate?: string;
  costDelta?: number;
  scheduleDays?: number;
}

export async function createChange(input: ActorContext & CreateChangeInput) {
  await assertChangeProject(input.organizationId, input.projectId);
  if (input.ownerId) await assertOwner(input.organizationId, input.ownerId);

  let code = input.code?.trim();
  if (code) {
    const existing = await prisma.changeRequest.findFirst({
      where: { projectId: input.projectId, code },
      select: { id: true },
    });
    if (existing) {
      throw new AppError("CONFLICT", `Código de mudança "${code}" já existe no projeto.`);
    }
  } else {
    code = await nextChangeCode(input.projectId);
  }

  const change = await prisma.changeRequest.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      code,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      justification: input.justification?.trim() || null,
      category: input.category ?? "SCOPE",
      ownerId: input.ownerId ?? null,
      requestedById: input.actorId,
      dueDate: toDate(input.dueDate),
      costDelta: input.costDelta ?? null,
      scheduleDays: input.scheduleDays ?? null,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });

  await audit(input, input.projectId, "CREATE", {
    objectId: change.id,
    newValue: { code: change.code, title: change.title, category: change.category },
  });

  return change;
}

export interface UpdateChangeInput {
  changeId: string;
  code?: string;
  title?: string;
  description?: string;
  justification?: string;
  category?: ChangeDimension;
  ownerId?: string | null;
  dueDate?: string;
  costDelta?: number;
  scheduleDays?: number;
}

// O pedido só é editável em DRAFT (BR-004: depois de submetido, o change passa
// a ser controlado pelo workflow, não por edição direta).
export async function updateChange(input: ActorContext & UpdateChangeInput) {
  const change = await loadLiveChange(input.organizationId, input.changeId);

  if (!isChangeEditable(change.status)) {
    throw new AppError(
      "CHANGE_INVALID_STATE",
      `Mudança em status ${change.status} não é editável — avance o workflow.`
    );
  }

  if (input.ownerId) await assertOwner(input.organizationId, input.ownerId);
  if (input.code !== undefined && input.code.trim() !== change.code) {
    const existing = await prisma.changeRequest.findFirst({
      where: { projectId: change.projectId, code: input.code.trim() },
      select: { id: true },
    });
    if (existing) {
      throw new AppError("CONFLICT", `Código de mudança "${input.code.trim()}" já existe no projeto.`);
    }
  }

  const updated = await prisma.changeRequest.update({
    where: { id: change.id },
    data: {
      ...(input.code !== undefined ? { code: input.code.trim() } : {}),
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() || null } : {}),
      ...(input.justification !== undefined ? { justification: input.justification.trim() || null } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
      ...(input.dueDate !== undefined ? { dueDate: toDate(input.dueDate) ?? null } : {}),
      ...(input.costDelta !== undefined ? { costDelta: input.costDelta } : {}),
      ...(input.scheduleDays !== undefined ? { scheduleDays: input.scheduleDays } : {}),
      updatedBy: input.actorId,
      version: { increment: 1 },
    },
  });

  await audit(input, change.projectId, "UPDATE", {
    objectId: change.id,
    oldValue: { status: change.status },
    newValue: { status: updated.status },
  });

  return updated;
}

// Exclusão lógica; mudanças aprovadas/implementadas/encerradas são histórico
// e não somem (mesma regra dos riscos encerrados).
export async function deleteChange(input: ActorContext & { changeId: string }) {
  const change = await loadLiveChange(input.organizationId, input.changeId);

  if (change.status !== "DRAFT" && change.status !== "CANCELLED" && change.status !== "REJECTED") {
    throw new AppError(
      "CHANGE_INVALID_STATE",
      "Mudança no fluxo ativo não pode ser excluída — cancele antes (se aplicável)."
    );
  }

  await prisma.changeRequest.update({
    where: { id: change.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId },
  });

  await audit(input, change.projectId, "DELETE", {
    objectId: change.id,
    oldValue: { code: change.code, title: change.title, status: change.status },
  });

  return { changeId: change.id };
}

export interface ChangeTransitionInput {
  changeId: string;
  action: ChangeAction;
  reason?: string;
  implementationNotes?: string;
  baselineIds?: string[];
}

// Transição do workflow §31. Regras por ação:
// - CANCEL exige motivo;
// - REQUEST_APPROVAL exige ≥1 dimensão de impacto avaliada;
// - REJECT exige motivo e grava ChangeApproval REJECT;
// - APPROVE grava ChangeApproval APPROVE (auditada — BR-004);
// - IMPLEMENT exige notas de implementação e aceita baselineIds para
//   vincular baselines do projeto à mudança (baseline revision, BR-005);
// - VERIFY exige nota de verificação.
export async function transitionChange(input: ActorContext & ChangeTransitionInput) {
  const change = await loadLiveChange(input.organizationId, input.changeId);

  const next = nextChangeStatus(change.status, input.action);
  if (!next) {
    throw new AppError(
      "CHANGE_INVALID_STATE",
      `Transição "${input.action}" inválida para o status ${change.status}.`
    );
  }

  if (input.action === "CANCEL" && !input.reason?.trim()) {
    throw new AppError("VALIDATION_ERROR", "Cancelamento exige um motivo.");
  }
  if (input.action === "REJECT" && !input.reason?.trim()) {
    throw new AppError("VALIDATION_ERROR", "Rejeição exige um motivo.");
  }
  if (input.action === "IMPLEMENT" && !input.implementationNotes?.trim()) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Implementação exige as notas de implementação (o que foi feito)."
    );
  }
  if (input.action === "VERIFY" && !input.reason?.trim()) {
    throw new AppError("VALIDATION_ERROR", "Verificação exige uma nota (resultado da verificação).");
  }

  if (input.action === "REQUEST_APPROVAL") {
    const impactCount = await prisma.changeImpact.count({
      where: { changeId: change.id },
    });
    if (impactCount === 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Envio para aprovação exige ao menos uma dimensão de impacto avaliada."
      );
    }
  }

  if (input.action === "IMPLEMENT" && input.baselineIds?.length) {
    const baselines = await prisma.baseline.findMany({
      where: { id: { in: input.baselineIds }, organizationId: change.organizationId, projectId: change.projectId },
      select: { id: true, type: true, version: true, changeRequestId: true },
    });
    if (baselines.length !== input.baselineIds.length) {
      throw new AppError("VALIDATION_ERROR", "Uma ou mais baselines não pertencem a este projeto.");
    }
    const foreign = baselines.find(
      (baseline) => baseline.changeRequestId && baseline.changeRequestId !== change.id
    );
    if (foreign) {
      throw new AppError(
        "CONFLICT",
        `Baseline v${foreign.version} (${foreign.type}) já está vinculada a outra mudança.`
      );
    }
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    if (input.action === "APPROVE" || input.action === "REJECT") {
      await tx.changeApproval.create({
        data: {
          organizationId: input.organizationId,
          projectId: change.projectId,
          changeId: change.id,
          action: input.action,
          comment: input.reason?.trim() || null,
          approverId: input.actorId,
        },
      });
    }

    if (input.action === "IMPLEMENT" && input.baselineIds?.length) {
      await tx.baseline.updateMany({
        where: { id: { in: input.baselineIds }, changeRequestId: null },
        data: { changeRequestId: change.id },
      });
    }

    return tx.changeRequest.update({
      where: { id: change.id },
      data: {
        status: next,
        ...(input.action === "CANCEL" ? { cancelReason: input.reason!.trim() } : {}),
        ...(input.action === "REJECT" ? { rejectReason: input.reason!.trim() } : {}),
        ...(input.action === "APPROVE" ? { approvedAt: now, approvedBy: input.actorId } : {}),
        ...(input.action === "IMPLEMENT"
          ? {
              implementationNotes: input.implementationNotes!.trim(),
              implementedAt: now,
              implementedBy: input.actorId,
            }
          : {}),
        ...(input.action === "VERIFY" ? { verifiedAt: now, verifiedBy: input.actorId } : {}),
        ...(input.action === "CLOSE" ? { closedAt: now, closedBy: input.actorId } : {}),
        ...(input.action === "CANCEL" ? { cancelledAt: now, cancelledBy: input.actorId } : {}),
        updatedBy: input.actorId,
        version: { increment: 1 },
      },
    });
  });

  await audit(input, change.projectId, input.action, {
    objectId: change.id,
    oldValue: { status: change.status },
    newValue: {
      status: updated.status,
      ...(input.baselineIds?.length ? { baselineIds: input.baselineIds } : {}),
    },
    reason: input.reason?.trim() ?? null,
  });

  const EVENT_BY_ACTION: Partial<Record<ChangeAction, string>> = {
    SUBMIT: "Change.Requested",
    APPROVE: "Change.Approved",
    REJECT: "Change.Rejected",
    IMPLEMENT: "Change.Implemented",
    CLOSE: "Change.Closed",
  };
  const eventType = EVENT_BY_ACTION[input.action];
  if (eventType) {
    await emitDomainEvent(input, change.projectId, eventType, change.id, {
      code: change.code,
      status: updated.status,
    });
  }

  return updated;
}

export interface UpsertChangeImpactInput {
  changeId: string;
  dimension: ChangeDimension;
  severity: ImpactSeverity;
  notes?: string;
}

// Avaliação de impacto por dimensão (§31 ChangeImpact): upsert por
// (changeId, dimension); permitido enquanto o pedido é editável (DRAFT) ou
// durante a análise formal (IMPACT_ANALYSIS).
export async function upsertChangeImpact(input: ActorContext & UpsertChangeImpactInput) {
  const change = await loadLiveChange(input.organizationId, input.changeId);

  if (!isChangeEditable(change.status)) {
    throw new AppError(
      "CHANGE_INVALID_STATE",
      `Avaliação de impacto não é permitida em status ${change.status}.`
    );
  }

  const now = new Date();
  const existing = await prisma.changeImpact.findUnique({
    where: { changeId_dimension: { changeId: change.id, dimension: input.dimension } },
  });

  const impact = existing
    ? await prisma.changeImpact.update({
        where: { id: existing.id },
        data: {
          severity: input.severity,
          notes: input.notes?.trim() || null,
          assessedById: input.actorId,
          assessedAt: now,
          updatedBy: input.actorId,
        },
      })
    : await prisma.changeImpact.create({
        data: {
          organizationId: input.organizationId,
          projectId: change.projectId,
          changeId: change.id,
          dimension: input.dimension,
          severity: input.severity,
          notes: input.notes?.trim() || null,
          assessedById: input.actorId,
          assessedAt: now,
          createdBy: input.actorId,
          updatedBy: input.actorId,
        },
      });

  await audit(input, change.projectId, existing ? "IMPACT_UPDATE" : "IMPACT_CREATE", {
    objectId: change.id,
    newValue: { dimension: input.dimension, severity: input.severity },
  });

  return impact;
}
