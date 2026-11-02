import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import {
  isAcceptanceEditable,
  nextAcceptanceStatus,
  type AcceptanceAction,
} from "@/modules/commissioning/engine";
import {
  assertCommissioningProject,
  assertCodeFree,
  assertFieldLinks,
  audit,
  emitDomainEvent,
  findByIdempotentKey,
  nextCommissioningCode,
  type ActorContext,
} from "@/modules/commissioning/common";

export interface CreateAcceptanceInput {
  projectId: string;
  code?: string;
  commissioningPlanId?: string | null;
  scope: string;
  notes?: string;
  wbsNodeId?: string | null;
  activityId?: string | null;
  documentId?: string | null;
  clientUuid?: string;
}

export interface UpdateAcceptanceInput {
  acceptanceId: string;
  commissioningPlanId?: string | null;
  scope?: string;
  notes?: string | null;
  wbsNodeId?: string | null;
  activityId?: string | null;
  documentId?: string | null;
}

export interface AcceptanceTransitionInput {
  acceptanceId: string;
  action: string;
  reason?: string;
  notes?: string;
}

async function loadLiveAcceptance(organizationId: string, acceptanceId: string) {
  const acceptance = await prisma.acceptance.findFirst({
    where: { id: acceptanceId, organizationId, deletedAt: null },
  });
  if (!acceptance) throw new AppError("NOT_FOUND", "Aceite não encontrado nesta organização.");
  return acceptance;
}

export async function createAcceptance(input: ActorContext & CreateAcceptanceInput) {
  await assertCommissioningProject(input.organizationId, input.projectId);

  if (input.commissioningPlanId) {
    const plan = await prisma.commissioningPlan.findFirst({
      where: { id: input.commissioningPlanId, organizationId: input.organizationId, projectId: input.projectId, deletedAt: null },
    });
    if (!plan) throw new AppError("VALIDATION_ERROR", "Plano de comissionamento inválido para este projeto.");
  }

  const replay = await findByIdempotentKey(input.projectId, input.clientUuid, (where) =>
    prisma.acceptance.findFirst({ where, select: { id: true } })
  );
  if (replay) return prisma.acceptance.findFirstOrThrow({ where: { id: replay.id } });

  await assertFieldLinks(input.organizationId, input.projectId, {
    wbsNodeId: input.wbsNodeId,
    activityId: input.activityId,
  });

  let code = input.code?.trim();
  if (code) {
    await assertCodeFree(input.projectId, code, (where) => prisma.acceptance.findFirst({ where, select: { id: true } }), "de aceite");
  } else {
    code = await nextCommissioningCode(input.projectId, "AC");
  }

  const acceptance = await prisma.acceptance.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      code,
      commissioningPlanId: input.commissioningPlanId ?? null,
      scope: input.scope.trim(),
      status: "DRAFT",
      notes: input.notes?.trim() ?? null,
      wbsNodeId: input.wbsNodeId ?? null,
      activityId: input.activityId ?? null,
      documentId: input.documentId ?? null,
      clientUuid: input.clientUuid ?? null,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });

  await audit(input, input.projectId, "Acceptance", "CREATE", { objectId: acceptance.id, newValue: { code: acceptance.code, scope: acceptance.scope } });
  await emitDomainEvent(input, input.projectId, "Commissioning.Acceptance.Created", "Acceptance", acceptance.id, { code: acceptance.code });
  return acceptance;
}

export async function updateAcceptance(input: ActorContext & UpdateAcceptanceInput) {
  const acceptance = await loadLiveAcceptance(input.organizationId, input.acceptanceId);
  if (!isAcceptanceEditable(acceptance.status as never)) {
    throw new AppError("CONFLICT", "Aceite aprovado/rejeitado não aceita alterações — reabra para editar.");
  }
  if (input.commissioningPlanId) {
    const plan = await prisma.commissioningPlan.findFirst({
      where: { id: input.commissioningPlanId, organizationId: input.organizationId, projectId: acceptance.projectId, deletedAt: null },
    });
    if (!plan) throw new AppError("VALIDATION_ERROR", "Plano de comissionamento inválido para este projeto.");
  }
  if (input.wbsNodeId !== undefined || input.activityId !== undefined) {
    await assertFieldLinks(input.organizationId, acceptance.projectId, {
      wbsNodeId: input.wbsNodeId === undefined ? acceptance.wbsNodeId : input.wbsNodeId,
      activityId: input.activityId === undefined ? acceptance.activityId : input.activityId,
    });
  }
  const data: Record<string, unknown> = {};
  if (input.commissioningPlanId !== undefined) data.commissioningPlanId = input.commissioningPlanId;
  if (input.scope !== undefined) data.scope = input.scope.trim();
  if (input.notes !== undefined) data.notes = input.notes?.trim() ?? null;
  if (input.wbsNodeId !== undefined) data.wbsNodeId = input.wbsNodeId;
  if (input.activityId !== undefined) data.activityId = input.activityId;
  if (input.documentId !== undefined) data.documentId = input.documentId;
  if (Object.keys(data).length === 0) return acceptance;
  data.updatedBy = input.actorId;
  data.version = { increment: 1 };
  const updated = await prisma.acceptance.update({ where: { id: acceptance.id }, data });
  await audit(input, acceptance.projectId, "Acceptance", "UPDATE", { objectId: acceptance.id, oldValue: { scope: acceptance.scope }, newValue: { scope: updated.scope } });
  return updated;
}

export async function transitionAcceptance(input: ActorContext & AcceptanceTransitionInput) {
  const acceptance = await loadLiveAcceptance(input.organizationId, input.acceptanceId);
  const action = input.action as AcceptanceAction;
  const next = nextAcceptanceStatus(acceptance.status as never, action);
  if (!next) {
    throw new AppError("VALIDATION_ERROR", "Ação não permitida no status atual do aceite.");
  }
  if (action === "REJECT" && !input.reason?.trim()) {
    throw new AppError("VALIDATION_ERROR", "Informe o motivo da rejeição.");
  }
  const now = new Date();
  const data: Record<string, unknown> = {
    status: next,
    updatedBy: input.actorId,
    version: { increment: 1 },
  };
  if (action === "APPROVE") {
    data.acceptedById = input.actorId;
    data.acceptedAt = now;
  }
  if (action === "REJECT") {
    data.rejectReason = input.reason?.trim() ?? null;
  }
  if (input.notes !== undefined) data.notes = input.notes?.trim() ?? null;
  const updated = await prisma.acceptance.update({ where: { id: acceptance.id }, data });
  await audit(input, acceptance.projectId, "Acceptance", action, {
    objectId: acceptance.id,
    oldValue: { status: acceptance.status },
    newValue: { status: updated.status },
    reason: input.reason?.trim() ?? null,
  });
  await emitDomainEvent(input, acceptance.projectId, `Commissioning.Acceptance.${action}`, "Acceptance", acceptance.id, { code: acceptance.code, from: acceptance.status, to: updated.status });
  return updated;
}

export async function deleteAcceptance(input: ActorContext & { acceptanceId: string }) {
  const acceptance = await loadLiveAcceptance(input.organizationId, input.acceptanceId);
  if (acceptance.status !== "DRAFT" && acceptance.status !== "REJECTED") {
    throw new AppError("CONFLICT", "Apenas aceites em rascunho/rejeitados podem ser excluídos.");
  }
  await prisma.acceptance.update({
    where: { id: acceptance.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId },
  });
  await audit(input, acceptance.projectId, "Acceptance", "DELETE", { objectId: acceptance.id, oldValue: { code: acceptance.code, scope: acceptance.scope } });
  await emitDomainEvent(input, acceptance.projectId, "Commissioning.Acceptance.Deleted", "Acceptance", acceptance.id, { code: acceptance.code });
  return { acceptanceId: acceptance.id };
}