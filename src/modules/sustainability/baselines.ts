import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { assertSustainabilityProject, assertCodeFree, audit, emitDomainEvent, findByIdempotentKey, nextSustainabilityCode, toDate, type ActorContext } from "@/modules/sustainability/common";

export interface CreateSustainabilityBaselineInput { projectId: string; code?: string; metricId: string; value: number; recordedAt: string; source?: string; notes?: string; clientUuid?: string; }
export interface UpdateSustainabilityBaselineInput { baselineId: string; value?: number; recordedAt?: string; source?: string | null; notes?: string | null; }

async function loadLive(organizationId: string, baselineId: string) {
  const b = await prisma.sustainabilityBaseline.findFirst({ where: { id: baselineId, organizationId, deletedAt: null } });
  if (!b) throw new AppError("NOT_FOUND", "Baseline não encontrado nesta organização.");
  return b;
}

export async function createSustainabilityBaseline(input: ActorContext & CreateSustainabilityBaselineInput) {
  await assertSustainabilityProject(input.organizationId, input.projectId);
  const metric = await prisma.sustainabilityMetric.findFirst({ where: { id: input.metricId, organizationId: input.organizationId, projectId: input.projectId, deletedAt: null } });
  if (!metric) throw new AppError("VALIDATION_ERROR", "Métrica inválida para este projeto.");
  const replay = await findByIdempotentKey(input.projectId, input.clientUuid, (where) => prisma.sustainabilityBaseline.findFirst({ where, select: { id: true } }));
  if (replay) return prisma.sustainabilityBaseline.findFirstOrThrow({ where: { id: replay.id } });
  let code = input.code?.trim();
  if (code) await assertCodeFree(input.projectId, code, (where) => prisma.sustainabilityBaseline.findFirst({ where, select: { id: true } }), "de baseline");
  else code = await nextSustainabilityCode(input.projectId, "SB");
  const baseline = await prisma.sustainabilityBaseline.create({
    data: {
      organizationId: input.organizationId, projectId: input.projectId, code, metricId: input.metricId,
      value: input.value, recordedAt: toDate(input.recordedAt)!, source: input.source?.trim() ?? null,
      notes: input.notes?.trim() ?? null, clientUuid: input.clientUuid ?? null,
      createdBy: input.actorId, updatedBy: input.actorId,
    },
  });
  await audit(input, input.projectId, "SustainabilityBaseline", "CREATE", { objectId: baseline.id, newValue: { code: baseline.code, value: baseline.value } });
  await emitDomainEvent(input, input.projectId, "Sustainability.Baseline.Created", "SustainabilityBaseline", baseline.id, { code: baseline.code });
  return baseline;
}

export async function updateSustainabilityBaseline(input: ActorContext & UpdateSustainabilityBaselineInput) {
  const baseline = await loadLive(input.organizationId, input.baselineId);
  const data: Record<string, unknown> = {};
  if (input.value !== undefined) data.value = input.value;
  if (input.recordedAt !== undefined) data.recordedAt = toDate(input.recordedAt);
  if (input.source !== undefined) data.source = input.source?.trim() ?? null;
  if (input.notes !== undefined) data.notes = input.notes?.trim() ?? null;
  if (Object.keys(data).length === 0) return baseline;
  data.updatedBy = input.actorId; data.version = { increment: 1 };
  const updated = await prisma.sustainabilityBaseline.update({ where: { id: baseline.id }, data });
  await audit(input, baseline.projectId, "SustainabilityBaseline", "UPDATE", { objectId: baseline.id, oldValue: { value: baseline.value }, newValue: { value: updated.value } });
  return updated;
}

export async function deleteSustainabilityBaseline(input: ActorContext & { baselineId: string }) {
  const baseline = await loadLive(input.organizationId, input.baselineId);
  await prisma.sustainabilityBaseline.update({ where: { id: baseline.id }, data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId } });
  await audit(input, baseline.projectId, "SustainabilityBaseline", "DELETE", { objectId: baseline.id, oldValue: { code: baseline.code } });
  await emitDomainEvent(input, baseline.projectId, "Sustainability.Baseline.Deleted", "SustainabilityBaseline", baseline.id, { code: baseline.code });
  return { baselineId: baseline.id };
}