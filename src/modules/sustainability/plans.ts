import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { isSustainabilityPlanEditable, nextSustainabilityPlanStatus, type SustainabilityPlanAction } from "@/modules/sustainability/engine";
import { assertSustainabilityProject, assertCodeFree, assertFieldLinks, assertMember, audit, emitDomainEvent, findByIdempotentKey, nextSustainabilityCode, toDate, type ActorContext } from "@/modules/sustainability/common";

export interface CreateSustainabilityPlanInput { projectId: string; code?: string; title: string; description?: string; ownerId?: string | null; startDate?: string; plannedEndDate?: string; wbsNodeId?: string | null; activityId?: string | null; clientUuid?: string; }
export interface UpdateSustainabilityPlanInput { planId: string; title?: string; description?: string | null; ownerId?: string | null; startDate?: string | null; plannedEndDate?: string | null; wbsNodeId?: string | null; activityId?: string | null; }
export interface SustainabilityPlanTransitionInput { planId: string; action: string; reason?: string; }

async function loadLive(organizationId: string, planId: string) {
  const plan = await prisma.sustainabilityPlan.findFirst({ where: { id: planId, organizationId, deletedAt: null } });
  if (!plan) throw new AppError("NOT_FOUND", "Plano de sustentabilidade não encontrado nesta organização.");
  return plan;
}

export async function createSustainabilityPlan(input: ActorContext & CreateSustainabilityPlanInput) {
  await assertSustainabilityProject(input.organizationId, input.projectId);
  const replay = await findByIdempotentKey(input.projectId, input.clientUuid, (where) => prisma.sustainabilityPlan.findFirst({ where, select: { id: true } }));
  if (replay) return prisma.sustainabilityPlan.findFirstOrThrow({ where: { id: replay.id } });
  if (input.ownerId) await assertMember(input.organizationId, input.ownerId);
  await assertFieldLinks(input.organizationId, input.projectId, { wbsNodeId: input.wbsNodeId, activityId: input.activityId });
  let code = input.code?.trim();
  if (code) await assertCodeFree(input.projectId, code, (where) => prisma.sustainabilityPlan.findFirst({ where, select: { id: true } }), "de plano de sustentabilidade");
  else code = await nextSustainabilityCode(input.projectId, "SP");
  const plan = await prisma.sustainabilityPlan.create({
    data: {
      organizationId: input.organizationId, projectId: input.projectId, code, title: input.title.trim(),
      description: input.description?.trim() ?? null, status: "DRAFT", ownerId: input.ownerId ?? null,
      startDate: input.startDate ? toDate(input.startDate) : null, plannedEndDate: input.plannedEndDate ? toDate(input.plannedEndDate) : null,
      wbsNodeId: input.wbsNodeId ?? null, activityId: input.activityId ?? null, clientUuid: input.clientUuid ?? null,
      createdBy: input.actorId, updatedBy: input.actorId,
    },
  });
  await audit(input, input.projectId, "SustainabilityPlan", "CREATE", { objectId: plan.id, newValue: { code: plan.code, title: plan.title } });
  await emitDomainEvent(input, input.projectId, "Sustainability.Plan.Created", "SustainabilityPlan", plan.id, { code: plan.code, title: plan.title });
  return plan;
}

export async function updateSustainabilityPlan(input: ActorContext & UpdateSustainabilityPlanInput) {
  const plan = await loadLive(input.organizationId, input.planId);
  if (!isSustainabilityPlanEditable(plan.status as never)) throw new AppError("CONFLICT", "Plano concluído/cancelado não aceita alterações.");
  if (input.ownerId) await assertMember(input.organizationId, input.ownerId);
  if (input.wbsNodeId !== undefined || input.activityId !== undefined) await assertFieldLinks(input.organizationId, plan.projectId, { wbsNodeId: input.wbsNodeId === undefined ? plan.wbsNodeId : input.wbsNodeId, activityId: input.activityId === undefined ? plan.activityId : input.activityId });
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.description !== undefined) data.description = input.description?.trim() ?? null;
  if (input.ownerId !== undefined) data.ownerId = input.ownerId;
  if (input.startDate !== undefined) data.startDate = input.startDate ? toDate(input.startDate) : null;
  if (input.plannedEndDate !== undefined) data.plannedEndDate = input.plannedEndDate ? toDate(input.plannedEndDate) : null;
  if (input.wbsNodeId !== undefined) data.wbsNodeId = input.wbsNodeId;
  if (input.activityId !== undefined) data.activityId = input.activityId;
  if (Object.keys(data).length === 0) return plan;
  data.updatedBy = input.actorId; data.version = { increment: 1 };
  const updated = await prisma.sustainabilityPlan.update({ where: { id: plan.id }, data });
  await audit(input, plan.projectId, "SustainabilityPlan", "UPDATE", { objectId: plan.id, oldValue: { title: plan.title }, newValue: { title: updated.title } });
  return updated;
}

export async function transitionSustainabilityPlan(input: ActorContext & SustainabilityPlanTransitionInput) {
  const plan = await loadLive(input.organizationId, input.planId);
  const action = input.action as SustainabilityPlanAction;
  const next = nextSustainabilityPlanStatus(plan.status as never, action);
  if (!next) throw new AppError("VALIDATION_ERROR", "Ação não permitida no status atual do plano.");
  if (action === "CANCEL" && !input.reason?.trim()) throw new AppError("VALIDATION_ERROR", "Informe o motivo do cancelamento.");
  const updated = await prisma.sustainabilityPlan.update({ where: { id: plan.id }, data: { status: next, updatedBy: input.actorId, version: { increment: 1 } } });
  await audit(input, plan.projectId, "SustainabilityPlan", action, { objectId: plan.id, oldValue: { status: plan.status }, newValue: { status: updated.status }, reason: input.reason?.trim() ?? null });
  await emitDomainEvent(input, plan.projectId, `Sustainability.Plan.${action}`, "SustainabilityPlan", plan.id, { code: plan.code, from: plan.status, to: updated.status });
  return updated;
}

export async function deleteSustainabilityPlan(input: ActorContext & { planId: string }) {
  const plan = await loadLive(input.organizationId, input.planId);
  if (plan.status !== "DRAFT" && plan.status !== "CANCELLED") throw new AppError("CONFLICT", "Apenas planos em rascunho/cancelados podem ser excluídos.");
  await prisma.sustainabilityPlan.update({ where: { id: plan.id }, data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId } });
  await audit(input, plan.projectId, "SustainabilityPlan", "DELETE", { objectId: plan.id, oldValue: { code: plan.code, title: plan.title } });
  await emitDomainEvent(input, plan.projectId, "Sustainability.Plan.Deleted", "SustainabilityPlan", plan.id, { code: plan.code });
  return { planId: plan.id };
}