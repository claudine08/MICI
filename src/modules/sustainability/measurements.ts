import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { assertSustainabilityProject, assertCodeFree, assertFieldLinks, audit, emitDomainEvent, findByIdempotentKey, nextSustainabilityCode, toDate, type ActorContext } from "@/modules/sustainability/common";

export interface CreateSustainabilityMeasurementInput { projectId: string; code?: string; metricId: string; value: number; measuredAt: string; wbsNodeId?: string | null; activityId?: string | null; notes?: string; evidenceNotes?: string; clientUuid?: string; }
export interface UpdateSustainabilityMeasurementInput { measurementId: string; value?: number; measuredAt?: string; wbsNodeId?: string | null; activityId?: string | null; notes?: string | null; evidenceNotes?: string | null; }

async function loadLive(organizationId: string, measurementId: string) {
  const m = await prisma.sustainabilityMeasurement.findFirst({ where: { id: measurementId, organizationId, deletedAt: null } });
  if (!m) throw new AppError("NOT_FOUND", "Medição não encontrada nesta organização.");
  return m;
}

export async function createSustainabilityMeasurement(input: ActorContext & CreateSustainabilityMeasurementInput) {
  await assertSustainabilityProject(input.organizationId, input.projectId);
  const metric = await prisma.sustainabilityMetric.findFirst({ where: { id: input.metricId, organizationId: input.organizationId, projectId: input.projectId, deletedAt: null } });
  if (!metric) throw new AppError("VALIDATION_ERROR", "Métrica inválida para este projeto.");
  const replay = await findByIdempotentKey(input.projectId, input.clientUuid, (where) => prisma.sustainabilityMeasurement.findFirst({ where, select: { id: true } }));
  if (replay) return prisma.sustainabilityMeasurement.findFirstOrThrow({ where: { id: replay.id } });
  await assertFieldLinks(input.organizationId, input.projectId, { wbsNodeId: input.wbsNodeId, activityId: input.activityId });
  let code = input.code?.trim();
  if (code) await assertCodeFree(input.projectId, code, (where) => prisma.sustainabilityMeasurement.findFirst({ where, select: { id: true } }), "de medição");
  else code = await nextSustainabilityCode(input.projectId, "MS");
  const measurement = await prisma.sustainabilityMeasurement.create({
    data: {
      organizationId: input.organizationId, projectId: input.projectId, code, metricId: input.metricId,
      value: input.value, measuredAt: toDate(input.measuredAt)!, wbsNodeId: input.wbsNodeId ?? null,
      activityId: input.activityId ?? null, notes: input.notes?.trim() ?? null,
      evidenceNotes: input.evidenceNotes?.trim() ?? null, clientUuid: input.clientUuid ?? null,
      createdBy: input.actorId, updatedBy: input.actorId,
    },
  });
  await audit(input, input.projectId, "SustainabilityMeasurement", "CREATE", { objectId: measurement.id, newValue: { code: measurement.code, value: measurement.value } });
  await emitDomainEvent(input, input.projectId, "Sustainability.Measurement.Created", "SustainabilityMeasurement", measurement.id, { code: measurement.code });
  return measurement;
}

export async function updateSustainabilityMeasurement(input: ActorContext & UpdateSustainabilityMeasurementInput) {
  const measurement = await loadLive(input.organizationId, input.measurementId);
  if (input.wbsNodeId !== undefined || input.activityId !== undefined) await assertFieldLinks(input.organizationId, measurement.projectId, { wbsNodeId: input.wbsNodeId === undefined ? measurement.wbsNodeId : input.wbsNodeId, activityId: input.activityId === undefined ? measurement.activityId : input.activityId });
  const data: Record<string, unknown> = {};
  if (input.value !== undefined) data.value = input.value;
  if (input.measuredAt !== undefined) data.measuredAt = toDate(input.measuredAt);
  if (input.wbsNodeId !== undefined) data.wbsNodeId = input.wbsNodeId;
  if (input.activityId !== undefined) data.activityId = input.activityId;
  if (input.notes !== undefined) data.notes = input.notes?.trim() ?? null;
  if (input.evidenceNotes !== undefined) data.evidenceNotes = input.evidenceNotes?.trim() ?? null;
  if (Object.keys(data).length === 0) return measurement;
  data.updatedBy = input.actorId; data.version = { increment: 1 };
  const updated = await prisma.sustainabilityMeasurement.update({ where: { id: measurement.id }, data });
  await audit(input, measurement.projectId, "SustainabilityMeasurement", "UPDATE", { objectId: measurement.id, oldValue: { value: measurement.value }, newValue: { value: updated.value } });
  return updated;
}

export async function deleteSustainabilityMeasurement(input: ActorContext & { measurementId: string }) {
  const measurement = await loadLive(input.organizationId, input.measurementId);
  await prisma.sustainabilityMeasurement.update({ where: { id: measurement.id }, data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId } });
  await audit(input, measurement.projectId, "SustainabilityMeasurement", "DELETE", { objectId: measurement.id, oldValue: { code: measurement.code } });
  await emitDomainEvent(input, measurement.projectId, "Sustainability.Measurement.Deleted", "SustainabilityMeasurement", measurement.id, { code: measurement.code });
  return { measurementId: measurement.id };
}