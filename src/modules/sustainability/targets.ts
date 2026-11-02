import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { assertSustainabilityProject, assertCodeFree, audit, emitDomainEvent, findByIdempotentKey, nextSustainabilityCode, toDate, type ActorContext } from "@/modules/sustainability/common";

export interface CreateSustainabilityTargetInput { projectId: string; code?: string; metricId: string; targetValue: number; dueDate?: string; notes?: string; clientUuid?: string; }
export interface UpdateSustainabilityTargetInput { targetId: string; targetValue?: number; dueDate?: string | null; notes?: string | null; }

async function loadLive(organizationId: string, targetId: string) {
  const t = await prisma.sustainabilityTarget.findFirst({ where: { id: targetId, organizationId, deletedAt: null } });
  if (!t) throw new AppError("NOT_FOUND", "Meta não encontrada nesta organização.");
  return t;
}

export async function createSustainabilityTarget(input: ActorContext & CreateSustainabilityTargetInput) {
  await assertSustainabilityProject(input.organizationId, input.projectId);
  const metric = await prisma.sustainabilityMetric.findFirst({ where: { id: input.metricId, organizationId: input.organizationId, projectId: input.projectId, deletedAt: null } });
  if (!metric) throw new AppError("VALIDATION_ERROR", "Métrica inválida para este projeto.");
  const replay = await findByIdempotentKey(input.projectId, input.clientUuid, (where) => prisma.sustainabilityTarget.findFirst({ where, select: { id: true } }));
  if (replay) return prisma.sustainabilityTarget.findFirstOrThrow({ where: { id: replay.id } });
  let code = input.code?.trim();
  if (code) await assertCodeFree(input.projectId, code, (where) => prisma.sustainabilityTarget.findFirst({ where, select: { id: true } }), "de meta");
  else code = await nextSustainabilityCode(input.projectId, "ST");
  const target = await prisma.sustainabilityTarget.create({
    data: {
      organizationId: input.organizationId, projectId: input.projectId, code, metricId: input.metricId,
      targetValue: input.targetValue, dueDate: input.dueDate ? toDate(input.dueDate) : null,
      notes: input.notes?.trim() ?? null, clientUuid: input.clientUuid ?? null,
      createdBy: input.actorId, updatedBy: input.actorId,
    },
  });
  await audit(input, input.projectId, "SustainabilityTarget", "CREATE", { objectId: target.id, newValue: { code: target.code, targetValue: target.targetValue } });
  await emitDomainEvent(input, input.projectId, "Sustainability.Target.Created", "SustainabilityTarget", target.id, { code: target.code });
  return target;
}

export async function updateSustainabilityTarget(input: ActorContext & UpdateSustainabilityTargetInput) {
  const target = await loadLive(input.organizationId, input.targetId);
  const data: Record<string, unknown> = {};
  if (input.targetValue !== undefined) data.targetValue = input.targetValue;
  if (input.dueDate !== undefined) data.dueDate = input.dueDate ? toDate(input.dueDate) : null;
  if (input.notes !== undefined) data.notes = input.notes?.trim() ?? null;
  if (Object.keys(data).length === 0) return target;
  data.updatedBy = input.actorId; data.version = { increment: 1 };
  const updated = await prisma.sustainabilityTarget.update({ where: { id: target.id }, data });
  await audit(input, target.projectId, "SustainabilityTarget", "UPDATE", { objectId: target.id, oldValue: { targetValue: target.targetValue }, newValue: { targetValue: updated.targetValue } });
  return updated;
}

export async function deleteSustainabilityTarget(input: ActorContext & { targetId: string }) {
  const target = await loadLive(input.organizationId, input.targetId);
  await prisma.sustainabilityTarget.update({ where: { id: target.id }, data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId } });
  await audit(input, target.projectId, "SustainabilityTarget", "DELETE", { objectId: target.id, oldValue: { code: target.code } });
  await emitDomainEvent(input, target.projectId, "Sustainability.Target.Deleted", "SustainabilityTarget", target.id, { code: target.code });
  return { targetId: target.id };
}