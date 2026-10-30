import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import {
  availablePunchItemActions,
  isPunchItemEditable,
  nextPunchItemStatus,
  type PunchItemAction,
} from "@/modules/quality/engine";
import { FIELD_PRIORITIES, type FieldPriority } from "@/modules/field/engine";
import {
  assertCodeFree,
  assertFieldLinks,
  assertQualityProject,
  assertMember,
  audit,
  emitDomainEvent,
  nextQualityCode,
  findByIdempotentKey,
  toDate,
  type ActorContext,
} from "@/modules/quality/common";

// Punch list (E13-US05, §34): itens de correção menores apurados na
// vistoria/entrega. OPEN → ASSIGNED → IN_PROGRESS → READY_FOR_VERIFICATION →
// VERIFIED → CLOSED; REJECTED volta a IN_PROGRESS.

export interface CreatePunchItemInput {
  projectId: string;
  code?: string;
  location: string;
  description: string;
  priority?: FieldPriority;
  ownerId?: string | null;
  dueDate?: string;
  wbsNodeId?: string | null;
  activityId?: string | null;
  photoEvidenceId?: string | null;
  clientUuid?: string;
}

export interface UpdatePunchItemInput {
  punchItemId: string;
  location?: string;
  description?: string;
  priority?: FieldPriority;
  ownerId?: string | null;
  dueDate?: string | null;
  wbsNodeId?: string | null;
  activityId?: string | null;
  photoEvidenceId?: string | null;
  correctionEvidenceId?: string | null;
}

export interface PunchItemTransitionInput {
  punchItemId: string;
  action: string;
  reason?: string;
  ownerId?: string | null;
  correctionEvidenceId?: string | null;
  verificationNotes?: string;
}

async function loadLivePunchItem(organizationId: string, punchItemId: string) {
  const item = await prisma.punchItem.findFirst({
    where: { id: punchItemId, organizationId, deletedAt: null },
  });
  if (!item) {
    throw new AppError("NOT_FOUND", "Item de punch list não encontrado nesta organização.");
  }
  return item;
}

async function assertLivePhoto(
  organizationId: string,
  projectId: string,
  photoEvidenceId: string,
  label: string
) {
  const photo = await prisma.photoEvidence.findFirst({
    where: { id: photoEvidenceId, organizationId, projectId, deletedAt: null },
    select: { id: true },
  });
  if (!photo) {
    throw new AppError("VALIDATION_ERROR", `${label} inválida para este projeto.`);
  }
}

export async function createPunchItem(input: ActorContext & CreatePunchItemInput) {
  await assertQualityProject(input.organizationId, input.projectId);

  const replay = await findByIdempotentKey(input.projectId, input.clientUuid, (where) =>
    prisma.punchItem.findFirst({ where, select: { id: true } })
  );
  if (replay) {
    return prisma.punchItem.findFirstOrThrow({ where: { id: replay.id } });
  }

  if (input.ownerId) {
    await assertMember(input.organizationId, input.ownerId);
  }
  await assertFieldLinks(input.organizationId, input.projectId, {
    wbsNodeId: input.wbsNodeId,
    activityId: input.activityId,
  });
  if (input.photoEvidenceId) {
    await assertLivePhoto(
      input.organizationId,
      input.projectId,
      input.photoEvidenceId,
      "Foto de evidência"
    );
  }

  let code = input.code?.trim();
  if (code) {
    await assertCodeFree(
      input.projectId,
      code,
      (where) => prisma.punchItem.findFirst({ where, select: { id: true } }),
      "de item de punch list"
    );
  } else {
    code = await nextQualityCode(input.projectId, "PX");
  }

  const item = await prisma.punchItem.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      code,
      location: input.location.trim(),
      description: input.description.trim(),
      priority: input.priority && FIELD_PRIORITIES.includes(input.priority) ? input.priority : "MEDIUM",
      status: "OPEN",
      ownerId: input.ownerId ?? null,
      dueDate: input.dueDate ? toDate(input.dueDate) : null,
      wbsNodeId: input.wbsNodeId ?? null,
      activityId: input.activityId ?? null,
      photoEvidenceId: input.photoEvidenceId ?? null,
      clientUuid: input.clientUuid ?? null,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });

  await audit(input, input.projectId, "PunchItem", "CREATE", {
    objectId: item.id,
    newValue: { code: item.code, location: item.location, priority: item.priority },
  });
  await emitDomainEvent(
    input,
    input.projectId,
    "Quality.PunchItem.Created",
    "PunchItem",
    item.id,
    { code: item.code, location: item.location, priority: item.priority }
  );

  return item;
}

export async function updatePunchItem(input: ActorContext & UpdatePunchItemInput) {
  const item = await loadLivePunchItem(input.organizationId, input.punchItemId);

  if (!isPunchItemEditable(item.status)) {
    throw new AppError(
      "CONFLICT",
      "Item pronto para verificação/encerrado não aceita alterações — use as transições."
    );
  }

  if (input.ownerId) {
    await assertMember(input.organizationId, input.ownerId);
  }
  if (input.wbsNodeId !== undefined || input.activityId !== undefined) {
    await assertFieldLinks(input.organizationId, item.projectId, {
      wbsNodeId: input.wbsNodeId === undefined ? item.wbsNodeId : input.wbsNodeId,
      activityId: input.activityId === undefined ? item.activityId : input.activityId,
    });
  }
  if (input.photoEvidenceId) {
    await assertLivePhoto(
      input.organizationId,
      item.projectId,
      input.photoEvidenceId,
      "Foto de evidência"
    );
  }
  if (input.correctionEvidenceId) {
    await assertLivePhoto(
      input.organizationId,
      item.projectId,
      input.correctionEvidenceId,
      "Foto de correção"
    );
  }

  const data: Record<string, unknown> = {};
  if (input.location !== undefined) data.location = input.location.trim();
  if (input.description !== undefined) data.description = input.description.trim();
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.ownerId !== undefined) data.ownerId = input.ownerId;
  if (input.dueDate !== undefined) data.dueDate = input.dueDate ? toDate(input.dueDate) : null;
  if (input.wbsNodeId !== undefined) data.wbsNodeId = input.wbsNodeId;
  if (input.activityId !== undefined) data.activityId = input.activityId;
  if (input.photoEvidenceId !== undefined) data.photoEvidenceId = input.photoEvidenceId;
  if (input.correctionEvidenceId !== undefined)
    data.correctionEvidenceId = input.correctionEvidenceId;
  if (Object.keys(data).length === 0) return item;

  data.updatedBy = input.actorId;
  data.version = { increment: 1 };

  const updated = await prisma.punchItem.update({
    where: { id: item.id },
    data,
  });

  await audit(input, item.projectId, "PunchItem", "UPDATE", {
    objectId: item.id,
    oldValue: { location: item.location },
    newValue: { location: updated.location },
  });

  return updated;
}

export async function transitionPunchItem(input: ActorContext & PunchItemTransitionInput) {
  const item = await loadLivePunchItem(input.organizationId, input.punchItemId);
  const reason = input.reason?.trim() || null;
  const verificationNotes = input.verificationNotes?.trim() || null;
  const action = input.action as PunchItemAction;

  if (input.action === "REJECT" && !reason) {
    throw new AppError("VALIDATION_ERROR", "Informe o motivo da reprovação.");
  }
  if (input.action === "VERIFY" && !verificationNotes) {
    throw new AppError("VALIDATION_ERROR", "Verificar exige descrever a verificação (verificationNotes).");
  }
  if (input.action === "ASSIGN") {
    const ownerId = input.ownerId ?? item.ownerId;
    if (!ownerId) {
      throw new AppError("VALIDATION_ERROR", "Atribuir exige um responsável (ownerId).");
    }
    if (input.ownerId) {
      await assertMember(input.organizationId, input.ownerId);
    }
  }
  if (input.action === "SUBMIT") {
    const correctionEvidenceId = input.correctionEvidenceId ?? item.correctionEvidenceId;
    if (!correctionEvidenceId) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Enviar para verificação exige foto da correção (correctionEvidenceId)."
      );
    }
    if (input.correctionEvidenceId) {
      await assertLivePhoto(
        input.organizationId,
        item.projectId,
        input.correctionEvidenceId,
        "Foto de correção"
      );
    }
  }

  const next = nextPunchItemStatus(item.status, action);
  if (!next) {
    const allowed = availablePunchItemActions(item.status);
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
  if (action === "ASSIGN" && input.ownerId) data.ownerId = input.ownerId;
  if (action === "SUBMIT" && input.correctionEvidenceId)
    data.correctionEvidenceId = input.correctionEvidenceId;
  if (action === "VERIFY") {
    data.verifiedById = input.actorId;
    data.verifiedAt = now;
  }
  if (action === "CLOSE") data.closedAt = now;
  if (reason && action === "REJECT") data.rejectReason = reason;
  if (verificationNotes) data.verificationNotes = verificationNotes;
  if (action === "REOPEN" && item.status === "CLOSED") {
    data.closedAt = null;
  }

  const updated = await prisma.punchItem.update({
    where: { id: item.id },
    data,
  });

  await audit(input, item.projectId, "PunchItem", input.action, {
    objectId: item.id,
    oldValue: { status: item.status },
    newValue: { status: updated.status },
    reason,
  });
  await emitDomainEvent(
    input,
    item.projectId,
    `Quality.PunchItem.${input.action}`,
    "PunchItem",
    item.id,
    { code: item.code, from: item.status, to: updated.status }
  );

  return updated;
}

export async function deletePunchItem(input: ActorContext & { punchItemId: string }) {
  const item = await loadLivePunchItem(input.organizationId, input.punchItemId);

  if (!isPunchItemEditable(item.status)) {
    throw new AppError(
      "CONFLICT",
      "Item pronto para verificação/encerrado não pode ser excluído — reabra para editar."
    );
  }

  await prisma.punchItem.update({
    where: { id: item.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId },
  });
  await audit(input, item.projectId, "PunchItem", "DELETE", {
    objectId: item.id,
    oldValue: { code: item.code, location: item.location },
  });
  await emitDomainEvent(
    input,
    item.projectId,
    "Quality.PunchItem.Deleted",
    "PunchItem",
    item.id,
    { code: item.code }
  );

  return { punchItemId: item.id };
}
