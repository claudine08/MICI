import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import {
  isCommissioningPlanEditable,
  nextCommissioningPlanStatus,
  type CommissioningPlanAction,
} from "@/modules/commissioning/engine";
import {
  assertCommissioningProject,
  assertCodeFree,
  assertFieldLinks,
  assertMember,
  audit,
  emitDomainEvent,
  findByIdempotentKey,
  nextCommissioningCode,
  toDate,
  type ActorContext,
} from "@/modules/commissioning/common";

export interface CreateCommissioningPlanInput {
  projectId: string;
  code?: string;
  title: string;
  description?: string;
  ownerId?: string | null;
  startDate?: string;
  plannedEndDate?: string;
  wbsNodeId?: string | null;
  activityId?: string | null;
  clientUuid?: string;
}

export interface UpdateCommissioningPlanInput {
  planId: string;
  title?: string;
  description?: string | null;
  ownerId?: string | null;
  startDate?: string | null;
  plannedEndDate?: string | null;
  wbsNodeId?: string | null;
  activityId?: string | null;
}

export interface CommissioningPlanTransitionInput {
  planId: string;
  action: string;
  reason?: string;
}

async function loadLivePlan(organizationId: string, planId: string) {
  const plan = await prisma.commissioningPlan.findFirst({
    where: { id: planId, organizationId, deletedAt: null },
  });
  if (!plan) throw new AppError("NOT_FOUND", "Plano de comissionamento não encontrado nesta organização.");
  return plan;
}

export async function createCommissioningPlan(input: ActorContext & CreateCommissioningPlanInput) {
  await assertCommissioningProject(input.organizationId, input.projectId);

  const replay = await findByIdempotentKey(input.projectId, input.clientUuid, (where) =>
    prisma.commissioningPlan.findFirst({ where, select: { id: true } })
  );
  if (replay) return prisma.commissioningPlan.findFirstOrThrow({ where: { id: replay.id } });

  if (input.ownerId) await assertMember(input.organizationId, input.ownerId);
  await assertFieldLinks(input.organizationId, input.projectId, {
    wbsNodeId: input.wbsNodeId,
    activityId: input.activityId,
  });

  let code = input.code?.trim();
  if (code) {
    await assertCodeFree(input.projectId, code, (where) => prisma.commissioningPlan.findFirst({ where, select: { id: true } }), "de plano de comissionamento");
  } else {
    code = await nextCommissioningCode(input.projectId, "CP");
  }

  const plan = await prisma.commissioningPlan.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      code,
      title: input.title.trim(),
      description: input.description?.trim() ?? null,
      status: "DRAFT",
      ownerId: input.ownerId ?? null,
      startDate: input.startDate ? toDate(input.startDate) : null,
      plannedEndDate: input.plannedEndDate ? toDate(input.plannedEndDate) : null,
      wbsNodeId: input.wbsNodeId ?? null,
      activityId: input.activityId ?? null,
      clientUuid: input.clientUuid ?? null,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });

  await audit(input, input.projectId, "CommissioningPlan", "CREATE", { objectId: plan.id, newValue: { code: plan.code, title: plan.title } });
  await emitDomainEvent(input, input.projectId, "Commissioning.Plan.Created", "CommissioningPlan", plan.id, { code: plan.code, title: plan.title });
  return plan;
}

export async function updateCommissioningPlan(input: ActorContext & UpdateCommissioningPlanInput) {
  const plan = await loadLivePlan(input.organizationId, input.planId);
  if (!isCommissioningPlanEditable(plan.status as never)) {
    throw new AppError("CONFLICT", "Plano concluído/cancelado não aceita alterações — reabra para editar.");
  }
  if (input.ownerId) await assertMember(input.organizationId, input.ownerId);
  if (input.wbsNodeId !== undefined || input.activityId !== undefined) {
    await assertFieldLinks(input.organizationId, plan.projectId, {
      wbsNodeId: input.wbsNodeId === undefined ? plan.wbsNodeId : input.wbsNodeId,
      activityId: input.activityId === undefined ? plan.activityId : input.activityId,
    });
  }
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.description !== undefined) data.description = input.description?.trim() ?? null;
  if (input.ownerId !== undefined) data.ownerId = input.ownerId;
  if (input.startDate !== undefined) data.startDate = input.startDate ? toDate(input.startDate) : null;
  if (input.plannedEndDate !== undefined) data.plannedEndDate = input.plannedEndDate ? toDate(input.plannedEndDate) : null;
  if (input.wbsNodeId !== undefined) data.wbsNodeId = input.wbsNodeId;
  if (input.activityId !== undefined) data.activityId = input.activityId;
  if (Object.keys(data).length === 0) return plan;
  data.updatedBy = input.actorId;
  data.version = { increment: 1 };
  const updated = await prisma.commissioningPlan.update({ where: { id: plan.id }, data });
  await audit(input, plan.projectId, "CommissioningPlan", "UPDATE", { objectId: plan.id, oldValue: { title: plan.title }, newValue: { title: updated.title } });
  return updated;
}

export async function transitionCommissioningPlan(input: ActorContext & CommissioningPlanTransitionInput) {
  const plan = await loadLivePlan(input.organizationId, input.planId);
  const action = input.action as CommissioningPlanAction;
  const next = nextCommissioningPlanStatus(plan.status as never, action);
  if (!next) {
    throw new AppError("VALIDATION_ERROR", "Ação não permitida no status atual do plano.");
  }
  const reason = input.reason?.trim() || null;
  if ((action === "CANCEL") && !reason) {
    throw new AppError("VALIDATION_ERROR", "Informe o motivo do cancelamento.");
  }
  const updated = await prisma.commissioningPlan.update({
    where: { id: plan.id },
    data: { status: next, updatedBy: input.actorId, version: { increment: 1 } },
  });
  await audit(input, plan.projectId, "CommissioningPlan", action, { objectId: plan.id, oldValue: { status: plan.status }, newValue: { status: updated.status }, reason });
  await emitDomainEvent(input, plan.projectId, `Commissioning.Plan.${action}`, "CommissioningPlan", plan.id, { code: plan.code, from: plan.status, to: updated.status });
  return updated;
}

export async function deleteCommissioningPlan(input: ActorContext & { planId: string }) {
  const plan = await loadLivePlan(input.organizationId, input.planId);
  if (plan.status !== "DRAFT" && plan.status !== "CANCELLED") {
    throw new AppError("CONFLICT", "Apenas planos em rascunho/cancelados podem ser excluídos.");
  }
  await prisma.commissioningPlan.update({
    where: { id: plan.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId },
  });
  await audit(input, plan.projectId, "CommissioningPlan", "DELETE", { objectId: plan.id, oldValue: { code: plan.code, title: plan.title } });
  await emitDomainEvent(input, plan.projectId, "Commissioning.Plan.Deleted", "CommissioningPlan", plan.id, { code: plan.code });
  return { planId: plan.id };
}