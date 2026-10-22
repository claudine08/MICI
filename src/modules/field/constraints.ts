import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { nextConstraintStatus, type ConstraintAction } from "@/modules/field/engine";
import {
  assertCodeFree,
  assertFieldLinks,
  assertMember,
  audit,
  emitDomainEvent,
  nextFieldCode,
  toDate,
  type ActorContext,
} from "@/modules/field/common";
import { assertFieldProject } from "@/modules/field/selectors";

// Restrição de campo (E12-US05, §39): Constraint Identification → Constraint
// Removal. Responsável, prazo e vínculo ao que restringe (atividade/WBS).

export interface CreateConstraintInput {
  projectId: string;
  code?: string;
  title: string;
  description?: string;
  type?: "SCOPE" | "SCHEDULE" | "COST" | "RESOURCE" | "TECHNICAL" | "EXTERNAL" | "REGULATORY" | "SAFETY";
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  ownerId?: string | null;
  dueDate?: string;
  wbsNodeId?: string | null;
  activityId?: string | null;
}

async function loadLiveConstraint(organizationId: string, constraintId: string) {
  const constraint = await prisma.constraint.findFirst({
    where: { id: constraintId, organizationId, deletedAt: null },
  });
  if (!constraint) {
    throw new AppError("NOT_FOUND", "Restrição não encontrada nesta organização.");
  }
  return constraint;
}

export async function createConstraint(input: ActorContext & CreateConstraintInput) {
  await assertFieldProject(input.organizationId, input.projectId);
  if (input.ownerId) await assertMember(input.organizationId, input.ownerId);
  await assertFieldLinks(input.organizationId, input.projectId, {
    wbsNodeId: input.wbsNodeId,
    activityId: input.activityId,
  });

  let code = input.code?.trim();
  if (code) {
    await assertCodeFree(
      input.projectId,
      code,
      (where) => prisma.constraint.findFirst({ where, select: { id: true } }),
      "de restrição"
    );
  } else {
    code = await nextFieldCode(input.projectId, "CN");
  }

  const constraint = await prisma.constraint.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      code,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      type: input.type ?? "EXTERNAL",
      priority: input.priority ?? "MEDIUM",
      ownerId: input.ownerId ?? null,
      dueDate: toDate(input.dueDate),
      wbsNodeId: input.wbsNodeId ?? null,
      activityId: input.activityId ?? null,
      identifiedAt: new Date(),
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });

  await audit(input, input.projectId, "Constraint", "CREATE", {
    objectId: constraint.id,
    newValue: { code: constraint.code, title: constraint.title, type: constraint.type },
  });
  await emitDomainEvent(input, input.projectId, "Constraint.Identified", "Constraint", constraint.id, {
    code: constraint.code,
    title: constraint.title,
  });

  return constraint;
}

export interface UpdateConstraintInput
  extends Partial<Omit<CreateConstraintInput, "projectId">> {
  constraintId: string;
}

export async function updateConstraint(input: ActorContext & UpdateConstraintInput) {
  const constraint = await loadLiveConstraint(input.organizationId, input.constraintId);

  if (constraint.status === "REMOVED" || constraint.status === "CANCELLED") {
    throw new AppError(
      "FIELD_INVALID_STATE",
      "Restrição removida/cancelada é histórico — reabra para alterar."
    );
  }

  if (input.ownerId) await assertMember(input.organizationId, input.ownerId);
  if (input.wbsNodeId !== undefined || input.activityId !== undefined) {
    await assertFieldLinks(input.organizationId, constraint.projectId, {
      wbsNodeId: input.wbsNodeId !== undefined ? input.wbsNodeId : constraint.wbsNodeId,
      activityId: input.activityId !== undefined ? input.activityId : constraint.activityId,
    });
  }
  if (input.code !== undefined && input.code.trim() !== constraint.code) {
    await assertCodeFree(
      constraint.projectId,
      input.code.trim(),
      (where) => prisma.constraint.findFirst({ where, select: { id: true } }),
      "de restrição"
    );
  }

  const data: Record<string, unknown> = {};
  if (input.code !== undefined) data.code = input.code.trim();
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.description !== undefined) data.description = input.description.trim() || null;
  if (input.type !== undefined) data.type = input.type;
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.ownerId !== undefined) data.ownerId = input.ownerId;
  if (input.dueDate !== undefined) data.dueDate = toDate(input.dueDate);
  if (input.wbsNodeId !== undefined) data.wbsNodeId = input.wbsNodeId;
  if (input.activityId !== undefined) data.activityId = input.activityId;

  const updated = await prisma.constraint.update({
    where: { id: constraint.id },
    data: { ...data, updatedBy: input.actorId, version: { increment: 1 } },
  });

  await audit(input, constraint.projectId, "Constraint", "UPDATE", {
    objectId: constraint.id,
    oldValue: { title: constraint.title, priority: constraint.priority },
    newValue: { title: updated.title, priority: updated.priority },
  });

  return updated;
}

export async function deleteConstraint(input: ActorContext & { constraintId: string }) {
  const constraint = await loadLiveConstraint(input.organizationId, input.constraintId);

  if (constraint.status !== "OPEN") {
    throw new AppError("FIELD_INVALID_STATE", "Só é possível excluir restrição identificada.");
  }

  await prisma.constraint.update({
    where: { id: constraint.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId },
  });
  await audit(input, constraint.projectId, "Constraint", "DELETE", {
    objectId: constraint.id,
    oldValue: { code: constraint.code, title: constraint.title },
  });
  await emitDomainEvent(input, constraint.projectId, "Constraint.Deleted", "Constraint", constraint.id, {
    code: constraint.code,
  });

  return { constraintId: constraint.id };
}

export interface ConstraintTransitionInput {
  constraintId: string;
  action: ConstraintAction;
  reason?: string;
  resolution?: string;
}

export async function transitionConstraint(input: ActorContext & ConstraintTransitionInput) {
  const constraint = await loadLiveConstraint(input.organizationId, input.constraintId);
  const next = nextConstraintStatus(constraint.status, input.action);

  if (!next) {
    throw new AppError(
      "FIELD_INVALID_STATE",
      `Transição "${input.action}" inválida para o status ${constraint.status}.`
    );
  }
  if (input.action === "CANCEL" && !input.reason?.trim()) {
    throw new AppError("VALIDATION_ERROR", "Cancelamento exige o motivo.");
  }
  if (input.action === "REMOVE" && !input.resolution?.trim()) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Remover a restrição exige descrever como foi resolvida."
    );
  }

  const now = new Date();
  const updated = await prisma.constraint.update({
    where: { id: constraint.id },
    data: {
      status: next,
      ...(input.action === "REMOVE" ? { removedAt: now, resolution: input.resolution!.trim() } : {}),
      ...(input.action === "CANCEL" ? { cancelReason: input.reason!.trim() } : {}),
      ...(input.action === "REOPEN"
        ? { removedAt: null, resolution: null, cancelReason: null }
        : {}),
      updatedBy: input.actorId,
      version: { increment: 1 },
    },
  });

  await audit(input, constraint.projectId, "Constraint", input.action, {
    objectId: constraint.id,
    oldValue: { status: constraint.status },
    newValue: { status: next },
    reason: input.reason ?? input.resolution ?? null,
  });
  await emitDomainEvent(
    input,
    constraint.projectId,
    `Constraint.${input.action}`,
    "Constraint",
    constraint.id,
    { code: constraint.code, status: next }
  );

  return updated;
}
