import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { assertSustainabilityProject, assertCodeFree, audit, emitDomainEvent, findByIdempotentKey, nextSustainabilityCode, type ActorContext } from "@/modules/sustainability/common";

export interface CreateSustainabilityMetricInput { projectId: string; code?: string; planId?: string | null; name: string; unit: string; category?: string; description?: string; clientUuid?: string; }
export interface UpdateSustainabilityMetricInput { metricId: string; planId?: string | null; name?: string; unit?: string; category?: string | null; description?: string | null; }

async function loadLive(organizationId: string, metricId: string) {
  const m = await prisma.sustainabilityMetric.findFirst({ where: { id: metricId, organizationId, deletedAt: null } });
  if (!m) throw new AppError("NOT_FOUND", "Métrica não encontrada nesta organização.");
  return m;
}

export async function createSustainabilityMetric(input: ActorContext & CreateSustainabilityMetricInput) {
  await assertSustainabilityProject(input.organizationId, input.projectId);
  if (input.planId) {
    const plan = await prisma.sustainabilityPlan.findFirst({ where: { id: input.planId, organizationId: input.organizationId, projectId: input.projectId, deletedAt: null } });
    if (!plan) throw new AppError("VALIDATION_ERROR", "Plano inválido para este projeto.");
  }
  const replay = await findByIdempotentKey(input.projectId, input.clientUuid, (where) => prisma.sustainabilityMetric.findFirst({ where, select: { id: true } }));
  if (replay) return prisma.sustainabilityMetric.findFirstOrThrow({ where: { id: replay.id } });
  let code = input.code?.trim();
  if (code) await assertCodeFree(input.projectId, code, (where) => prisma.sustainabilityMetric.findFirst({ where, select: { id: true } }), "de métrica");
  else code = await nextSustainabilityCode(input.projectId, "SM");
  const metric = await prisma.sustainabilityMetric.create({
    data: {
      organizationId: input.organizationId, projectId: input.projectId, code, planId: input.planId ?? null,
      name: input.name.trim(), unit: input.unit.trim(), category: input.category?.trim() ?? null,
      description: input.description?.trim() ?? null, clientUuid: input.clientUuid ?? null,
      createdBy: input.actorId, updatedBy: input.actorId,
    },
  });
  await audit(input, input.projectId, "SustainabilityMetric", "CREATE", { objectId: metric.id, newValue: { code: metric.code, name: metric.name } });
  await emitDomainEvent(input, input.projectId, "Sustainability.Metric.Created", "SustainabilityMetric", metric.id, { code: metric.code, name: metric.name });
  return metric;
}

export async function updateSustainabilityMetric(input: ActorContext & UpdateSustainabilityMetricInput) {
  const metric = await loadLive(input.organizationId, input.metricId);
  if (input.planId) {
    const plan = await prisma.sustainabilityPlan.findFirst({ where: { id: input.planId, organizationId: input.organizationId, projectId: metric.projectId, deletedAt: null } });
    if (!plan) throw new AppError("VALIDATION_ERROR", "Plano inválido para este projeto.");
  }
  const data: Record<string, unknown> = {};
  if (input.planId !== undefined) data.planId = input.planId;
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.unit !== undefined) data.unit = input.unit.trim();
  if (input.category !== undefined) data.category = input.category?.trim() ?? null;
  if (input.description !== undefined) data.description = input.description?.trim() ?? null;
  if (Object.keys(data).length === 0) return metric;
  data.updatedBy = input.actorId; data.version = { increment: 1 };
  const updated = await prisma.sustainabilityMetric.update({ where: { id: metric.id }, data });
  await audit(input, metric.projectId, "SustainabilityMetric", "UPDATE", { objectId: metric.id, oldValue: { name: metric.name }, newValue: { name: updated.name } });
  return updated;
}

export async function deleteSustainabilityMetric(input: ActorContext & { metricId: string }) {
  const metric = await loadLive(input.organizationId, input.metricId);
  await prisma.sustainabilityMetric.update({ where: { id: metric.id }, data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId } });
  await audit(input, metric.projectId, "SustainabilityMetric", "DELETE", { objectId: metric.id, oldValue: { code: metric.code, name: metric.name } });
  await emitDomainEvent(input, metric.projectId, "Sustainability.Metric.Deleted", "SustainabilityMetric", metric.id, { code: metric.code });
  return { metricId: metric.id };
}