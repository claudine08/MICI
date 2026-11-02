import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import {
  isCommissioningItemEditable,
  nextCommissioningItemStatus,
  type CommissioningItemAction,
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

export interface CreateCommissioningItemInput {
  projectId: string;
  planId: string;
  code?: string;
  title: string;
  description?: string;
  systemName?: string;
  testMethod?: string;
  acceptanceCriteria?: string;
  wbsNodeId?: string | null;
  activityId?: string | null;
  inspectionId?: string | null;
  clientUuid?: string;
}

export interface UpdateCommissioningItemInput {
  itemId: string;
  title?: string;
  description?: string | null;
  systemName?: string | null;
  testMethod?: string | null;
  acceptanceCriteria?: string | null;
  wbsNodeId?: string | null;
  activityId?: string | null;
  inspectionId?: string | null;
}

export interface CommissioningItemTransitionInput {
  itemId: string;
  action: string;
  reason?: string;
  notes?: string;
  result?: string;
  evidencePhotoId?: string | null;
  evidenceNotes?: string;
}

async function loadLiveItem(organizationId: string, itemId: string) {
  const item = await prisma.commissioningItem.findFirst({
    where: { id: itemId, organizationId, deletedAt: null },
  });
  if (!item) throw new AppError("NOT_FOUND", "Item de comissionamento não encontrado nesta organização.");
  return item;
}

async function assertLivePhoto(organizationId: string, projectId: string, photoId: string) {
  const photo = await prisma.photoEvidence.findFirst({
    where: { id: photoId, organizationId, projectId, deletedAt: null },
    select: { id: true },
  });
  if (!photo) throw new AppError("VALIDATION_ERROR", "Foto de evidência inválida para este projeto.");
}

export async function createCommissioningItem(input: ActorContext & CreateCommissioningItemInput) {
  await assertCommissioningProject(input.organizationId, input.projectId);

  const plan = await prisma.commissioningPlan.findFirst({
    where: { id: input.planId, organizationId: input.organizationId, projectId: input.projectId, deletedAt: null },
  });
  if (!plan) throw new AppError("VALIDATION_ERROR", "Plano de comissionamento inválido para este projeto.");

  const replay = await findByIdempotentKey(input.projectId, input.clientUuid, (where) =>
    prisma.commissioningItem.findFirst({ where, select: { id: true } })
  );
  if (replay) return prisma.commissioningItem.findFirstOrThrow({ where: { id: replay.id } });

  await assertFieldLinks(input.organizationId, input.projectId, {
    wbsNodeId: input.wbsNodeId,
    activityId: input.activityId,
  });

  let code = input.code?.trim();
  if (code) {
    await assertCodeFree(input.projectId, code, (where) => prisma.commissioningItem.findFirst({ where, select: { id: true } }), "de item de comissionamento");
  } else {
    code = await nextCommissioningCode(input.projectId, "CI");
  }

  const item = await prisma.commissioningItem.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      planId: input.planId,
      code,
      title: input.title.trim(),
      description: input.description?.trim() ?? null,
      systemName: input.systemName?.trim() ?? null,
      testMethod: input.testMethod?.trim() ?? null,
      acceptanceCriteria: input.acceptanceCriteria?.trim() ?? null,
      status: "PLANNED",
      wbsNodeId: input.wbsNodeId ?? null,
      activityId: input.activityId ?? null,
      inspectionId: input.inspectionId ?? null,
      clientUuid: input.clientUuid ?? null,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });

  await audit(input, input.projectId, "CommissioningItem", "CREATE", { objectId: item.id, newValue: { code: item.code, title: item.title } });
  await emitDomainEvent(input, input.projectId, "Commissioning.Item.Created", "CommissioningItem", item.id, { code: item.code, title: item.title });
  return item;
}

export async function updateCommissioningItem(input: ActorContext & UpdateCommissioningItemInput) {
  const item = await loadLiveItem(input.organizationId, input.itemId);
  if (!isCommissioningItemEditable(item.status as never)) {
    throw new AppError("CONFLICT", "Item concluído/aceito não aceita alterações — use as transições.");
  }
  if (input.wbsNodeId !== undefined || input.activityId !== undefined) {
    await assertFieldLinks(input.organizationId, item.projectId, {
      wbsNodeId: input.wbsNodeId === undefined ? item.wbsNodeId : input.wbsNodeId,
      activityId: input.activityId === undefined ? item.activityId : input.activityId,
    });
  }
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.description !== undefined) data.description = input.description?.trim() ?? null;
  if (input.systemName !== undefined) data.systemName = input.systemName?.trim() ?? null;
  if (input.testMethod !== undefined) data.testMethod = input.testMethod?.trim() ?? null;
  if (input.acceptanceCriteria !== undefined) data.acceptanceCriteria = input.acceptanceCriteria?.trim() ?? null;
  if (input.wbsNodeId !== undefined) data.wbsNodeId = input.wbsNodeId;
  if (input.activityId !== undefined) data.activityId = input.activityId;
  if (input.inspectionId !== undefined) data.inspectionId = input.inspectionId;
  if (Object.keys(data).length === 0) return item;
  data.updatedBy = input.actorId;
  data.version = { increment: 1 };
  const updated = await prisma.commissioningItem.update({ where: { id: item.id }, data });
  await audit(input, item.projectId, "CommissioningItem", "UPDATE", { objectId: item.id, oldValue: { title: item.title }, newValue: { title: updated.title } });
  return updated;
}

export async function transitionCommissioningItem(input: ActorContext & CommissioningItemTransitionInput) {
  const item = await loadLiveItem(input.organizationId, input.itemId);
  const action = input.action as CommissioningItemAction;
  const next = nextCommissioningItemStatus(item.status as never, action);
  if (!next) {
    throw new AppError("VALIDATION_ERROR", "Ação não permitida no status atual do item.");
  }
  if (action === "FAIL" && !input.reason?.trim()) {
    throw new AppError("VALIDATION_ERROR", "Informe o motivo da reprovação.");
  }
  if (action === "PASS" && input.result && input.result !== "PASS") {
    // allow
  }
  if (input.evidencePhotoId) {
    await assertLivePhoto(input.organizationId, item.projectId, input.evidencePhotoId);
  }

  const now = new Date();
  const data: Record<string, unknown> = {
    status: next,
    updatedBy: input.actorId,
    version: { increment: 1 },
  };
  if (action === "START") {
    data.executedById = input.actorId;
    data.executedAt = now;
  }
  if (action === "PASS") {
    data.result = "PASS";
    data.executedAt = item.executedAt ?? now;
    data.verifiedById = input.actorId;
    data.verifiedAt = now;
  }
  if (action === "FAIL") {
    data.result = "FAIL";
    data.rejectReason = input.reason?.trim() ?? null;
    data.verifiedById = input.actorId;
    data.verifiedAt = now;
  }
  if (action === "RETEST") {
    data.retestCount = { increment: 1 };
    data.result = null;
    data.rejectReason = null;
  }
  if (action === "ACCEPT") {
    data.acceptedAt = now;
  }
  if (input.notes !== undefined) data.notes = input.notes?.trim() ?? null;
  if (input.result !== undefined) data.result = input.result;
  if (input.evidencePhotoId !== undefined) data.evidencePhotoId = input.evidencePhotoId;
  if (input.evidenceNotes !== undefined) data.evidenceNotes = input.evidenceNotes?.trim() ?? null;

  const updated = await prisma.commissioningItem.update({ where: { id: item.id }, data });

  await audit(input, item.projectId, "CommissioningItem", action, {
    objectId: item.id,
    oldValue: { status: item.status },
    newValue: { status: updated.status },
    reason: input.reason?.trim() ?? null,
  });
  await emitDomainEvent(input, item.projectId, `Commissioning.Item.${action}`, "CommissioningItem", item.id, { code: item.code, from: item.status, to: updated.status });
  return updated;
}

export async function deleteCommissioningItem(input: ActorContext & { itemId: string }) {
  const item = await loadLiveItem(input.organizationId, input.itemId);
  if (item.status !== "PLANNED" && item.status !== "FAILED") {
    throw new AppError("CONFLICT", "Apenas itens planejados/reprovados podem ser excluídos.");
  }
  await prisma.commissioningItem.update({
    where: { id: item.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId },
  });
  await audit(input, item.projectId, "CommissioningItem", "DELETE", { objectId: item.id, oldValue: { code: item.code, title: item.title } });
  await emitDomainEvent(input, item.projectId, "Commissioning.Item.Deleted", "CommissioningItem", item.id, { code: item.code });
  return { itemId: item.id };
}