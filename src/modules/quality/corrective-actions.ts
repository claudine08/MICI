import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import {
  isCorrectiveActionEditable,
  nextCorrectiveActionStatus,
  availableCorrectiveActionActions,
} from "@/modules/quality/engine";
import {
  assertCodeFree,
  assertQualityProject,
  assertMember,
  audit,
  emitDomainEvent,
  nextQualityCode,
  findByIdempotentKey,
  toDate,
  type ActorContext,
} from "@/modules/quality/common";

// Ação corretiva (E13-US04): o que fazer para resolver um NCR, com
// responsável e prazo. OPEN → IN_PROGRESS → DONE → VERIFIED → CLOSED.

export interface CreateCorrectiveActionInput {
  projectId: string;
  nonConformityId: string;
  code?: string;
  title: string;
  description: string;
  responsibleId?: string | null;
  dueDate?: string;
  clientUuid?: string;
}

export interface UpdateCorrectiveActionInput {
  correctiveActionId: string;
  title?: string;
  description?: string;
  responsibleId?: string | null;
  dueDate?: string | null;
  actionNotes?: string | null;
}

export interface CorrectiveActionTransitionInput {
  correctiveActionId: string;
  action: string;
  reason?: string;
  actionNotes?: string;
  verificationNotes?: string;
}

async function loadLiveCorrectiveAction(organizationId: string, correctiveActionId: string) {
  const action = await prisma.correctiveAction.findFirst({
    where: { id: correctiveActionId, organizationId, deletedAt: null },
  });
  if (!action) {
    throw new AppError("NOT_FOUND", "Ação corretiva não encontrada nesta organização.");
  }
  return action;
}

async function assertLiveNonConformity(
  organizationId: string,
  projectId: string,
  nonConformityId: string
) {
  const ncr = await prisma.nonConformity.findFirst({
    where: { id: nonConformityId, organizationId, projectId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!ncr) {
    throw new AppError("VALIDATION_ERROR", "Não conformidade inválida para este projeto.");
  }
  return ncr;
}

export async function createCorrectiveAction(
  input: ActorContext & CreateCorrectiveActionInput
) {
  await assertQualityProject(input.organizationId, input.projectId);

  const replay = await findByIdempotentKey(input.projectId, input.clientUuid, (where) =>
    prisma.correctiveAction.findFirst({ where, select: { id: true } })
  );
  if (replay) {
    return prisma.correctiveAction.findFirstOrThrow({ where: { id: replay.id } });
  }

  const ncr = await assertLiveNonConformity(
    input.organizationId,
    input.projectId,
    input.nonConformityId
  );
  if (ncr.status === "CANCELLED") {
    throw new AppError("CONFLICT", "Não conformidade cancelada não aceita ações corretivas.");
  }
  if (input.responsibleId) {
    await assertMember(input.organizationId, input.responsibleId);
  }

  let code = input.code?.trim();
  if (code) {
    await assertCodeFree(
      input.projectId,
      code,
      (where) => prisma.correctiveAction.findFirst({ where, select: { id: true } }),
      "de ação corretiva"
    );
  } else {
    code = await nextQualityCode(input.projectId, "CA");
  }

  const action = await prisma.correctiveAction.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      code,
      title: input.title.trim(),
      description: input.description.trim(),
      status: "OPEN",
      nonConformityId: input.nonConformityId,
      responsibleId: input.responsibleId ?? null,
      dueDate: input.dueDate ? toDate(input.dueDate) : null,
      clientUuid: input.clientUuid ?? null,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });

  await audit(input, input.projectId, "CorrectiveAction", "CREATE", {
    objectId: action.id,
    newValue: {
      code: action.code,
      title: action.title,
      nonConformityId: action.nonConformityId,
    },
  });
  await emitDomainEvent(
    input,
    input.projectId,
    "Quality.CorrectiveAction.Created",
    "CorrectiveAction",
    action.id,
    { code: action.code, title: action.title, nonConformityId: action.nonConformityId }
  );

  return action;
}

export async function updateCorrectiveAction(
  input: ActorContext & UpdateCorrectiveActionInput
) {
  const action = await loadLiveCorrectiveAction(
    input.organizationId,
    input.correctiveActionId
  );

  if (!isCorrectiveActionEditable(action.status)) {
    throw new AppError(
      "CONFLICT",
      "Ação corretiva concluída/encerrada não aceita alterações — reabra para editar."
    );
  }

  if (input.responsibleId) {
    await assertMember(input.organizationId, input.responsibleId);
  }

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.description !== undefined) data.description = input.description.trim();
  if (input.responsibleId !== undefined) data.responsibleId = input.responsibleId;
  if (input.dueDate !== undefined) data.dueDate = input.dueDate ? toDate(input.dueDate) : null;
  if (input.actionNotes !== undefined) data.actionNotes = input.actionNotes;
  if (Object.keys(data).length === 0) return action;

  data.updatedBy = input.actorId;
  data.version = { increment: 1 };

  const updated = await prisma.correctiveAction.update({
    where: { id: action.id },
    data,
  });

  await audit(input, action.projectId, "CorrectiveAction", "UPDATE", {
    objectId: action.id,
    oldValue: { title: action.title },
    newValue: { title: updated.title },
  });

  return updated;
}

export async function transitionCorrectiveAction(
  input: ActorContext & CorrectiveActionTransitionInput
) {
  const action = await loadLiveCorrectiveAction(
    input.organizationId,
    input.correctiveActionId
  );
  const reason = input.reason?.trim() || null;
  const actionNotes = input.actionNotes?.trim() || null;
  const verificationNotes = input.verificationNotes?.trim() || null;

  if (input.action === "CANCEL" && !reason) {
    throw new AppError("VALIDATION_ERROR", "Informe o motivo do cancelamento.");
  }
  if (input.action === "COMPLETE" && !actionNotes && !action.actionNotes) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Concluir a correção exige descrever o que foi feito (actionNotes)."
    );
  }
  if (input.action === "VERIFY" && !verificationNotes && !action.verificationNotes) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Verificar exige descrever a verificação (verificationNotes)."
    );
  }

  const next = nextCorrectiveActionStatus(action.status, input.action as never);
  if (!next) {
    const allowed = availableCorrectiveActionActions(action.status);
    throw new AppError(
      "VALIDATION_ERROR",
      `Ação não permitida no status atual (${allowed.join(", ") || "não há ações disponíveis"}).`
    );
  }

  const now = new Date();
  const data: Record<string, unknown> = {
    status: next,
    updatedBy: input.actorId,
    version: { increment: 1 },
  };
  if (input.action === "COMPLETE") data.completedAt = now;
  if (input.action === "VERIFY") data.verifiedAt = now;
  if (input.action === "CLOSE") data.closedAt = now;
  if (input.action === "CANCEL") data.cancelReason = reason;
  if (actionNotes) data.actionNotes = actionNotes;
  if (verificationNotes) data.verificationNotes = verificationNotes;
  if (input.action === "REOPEN" && action.status === "CLOSED") {
    data.closedAt = null;
    data.verifiedAt = null;
  }

  const updated = await prisma.correctiveAction.update({
    where: { id: action.id },
    data,
  });

  await audit(input, action.projectId, "CorrectiveAction", input.action, {
    objectId: action.id,
    oldValue: { status: action.status },
    newValue: { status: updated.status },
    reason,
  });
  await emitDomainEvent(
    input,
    action.projectId,
    `Quality.CorrectiveAction.${input.action}`,
    "CorrectiveAction",
    action.id,
    { code: action.code, from: action.status, to: updated.status }
  );

  return updated;
}

export async function deleteCorrectiveAction(
  input: ActorContext & { correctiveActionId: string }
) {
  const action = await loadLiveCorrectiveAction(
    input.organizationId,
    input.correctiveActionId
  );

  if (action.status !== "OPEN" && action.status !== "IN_PROGRESS") {
    throw new AppError(
      "CONFLICT",
      "Ação corretiva concluída/encerrada não pode ser excluída — cancele para preservar a trilha."
    );
  }

  await prisma.correctiveAction.update({
    where: { id: action.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId },
  });
  await audit(input, action.projectId, "CorrectiveAction", "DELETE", {
    objectId: action.id,
    oldValue: { code: action.code, title: action.title },
  });
  await emitDomainEvent(
    input,
    action.projectId,
    "Quality.CorrectiveAction.Deleted",
    "CorrectiveAction",
    action.id,
    { code: action.code }
  );

  return { correctiveActionId: action.id };
}
