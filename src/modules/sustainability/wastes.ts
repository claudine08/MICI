import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { assertSustainabilityProject, assertCodeFree, assertFieldLinks, audit, emitDomainEvent, findByIdempotentKey, nextSustainabilityCode, toDate, type ActorContext } from "@/modules/sustainability/common";

export interface CreateWasteRecordInput { projectId: string; code?: string; wasteType: string; quantity: number; unit: string; destination?: string; recordedAt: string; wbsNodeId?: string | null; activityId?: string | null; notes?: string; clientUuid?: string; }
export interface UpdateWasteRecordInput { wasteId: string; wasteType?: string; quantity?: number; unit?: string; destination?: string | null; recordedAt?: string; wbsNodeId?: string | null; activityId?: string | null; notes?: string | null; }

async function loadLive(organizationId: string, wasteId: string) {
  const w = await prisma.wasteRecord.findFirst({ where: { id: wasteId, organizationId, deletedAt: null } });
  if (!w) throw new AppError("NOT_FOUND", "Registro de resíduo não encontrado nesta organização.");
  return w;
}

export async function createWasteRecord(input: ActorContext & CreateWasteRecordInput) {
  await assertSustainabilityProject(input.organizationId, input.projectId);
  const replay = await findByIdempotentKey(input.projectId, input.clientUuid, (where) => prisma.wasteRecord.findFirst({ where, select: { id: true } }));
  if (replay) return prisma.wasteRecord.findFirstOrThrow({ where: { id: replay.id } });
  await assertFieldLinks(input.organizationId, input.projectId, { wbsNodeId: input.wbsNodeId, activityId: input.activityId });
  let code = input.code?.trim();
  if (code) await assertCodeFree(input.projectId, code, (where) => prisma.wasteRecord.findFirst({ where, select: { id: true } }), "de resíduo");
  else code = await nextSustainabilityCode(input.projectId, "WR");
  const waste = await prisma.wasteRecord.create({
    data: {
      organizationId: input.organizationId, projectId: input.projectId, code,
      wasteType: input.wasteType.trim(), quantity: input.quantity, unit: input.unit.trim(),
      destination: input.destination?.trim() ?? null, recordedAt: toDate(input.recordedAt)!,
      wbsNodeId: input.wbsNodeId ?? null, activityId: input.activityId ?? null,
      notes: input.notes?.trim() ?? null, clientUuid: input.clientUuid ?? null,
      createdBy: input.actorId, updatedBy: input.actorId,
    },
  });
  await audit(input, input.projectId, "WasteRecord", "CREATE", { objectId: waste.id, newValue: { code: waste.code, wasteType: waste.wasteType, quantity: waste.quantity } });
  await emitDomainEvent(input, input.projectId, "Sustainability.Waste.Created", "WasteRecord", waste.id, { code: waste.code });
  return waste;
}

export async function updateWasteRecord(input: ActorContext & UpdateWasteRecordInput) {
  const waste = await loadLive(input.organizationId, input.wasteId);
  if (input.wbsNodeId !== undefined || input.activityId !== undefined) await assertFieldLinks(input.organizationId, waste.projectId, { wbsNodeId: input.wbsNodeId === undefined ? waste.wbsNodeId : input.wbsNodeId, activityId: input.activityId === undefined ? waste.activityId : input.activityId });
  const data: Record<string, unknown> = {};
  if (input.wasteType !== undefined) data.wasteType = input.wasteType.trim();
  if (input.quantity !== undefined) data.quantity = input.quantity;
  if (input.unit !== undefined) data.unit = input.unit.trim();
  if (input.destination !== undefined) data.destination = input.destination?.trim() ?? null;
  if (input.recordedAt !== undefined) data.recordedAt = toDate(input.recordedAt);
  if (input.wbsNodeId !== undefined) data.wbsNodeId = input.wbsNodeId;
  if (input.activityId !== undefined) data.activityId = input.activityId;
  if (input.notes !== undefined) data.notes = input.notes?.trim() ?? null;
  if (Object.keys(data).length === 0) return waste;
  data.updatedBy = input.actorId; data.version = { increment: 1 };
  const updated = await prisma.wasteRecord.update({ where: { id: waste.id }, data });
  await audit(input, waste.projectId, "WasteRecord", "UPDATE", { objectId: waste.id, oldValue: { wasteType: waste.wasteType }, newValue: { wasteType: updated.wasteType } });
  return updated;
}

export async function deleteWasteRecord(input: ActorContext & { wasteId: string }) {
  const waste = await loadLive(input.organizationId, input.wasteId);
  await prisma.wasteRecord.update({ where: { id: waste.id }, data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId } });
  await audit(input, waste.projectId, "WasteRecord", "DELETE", { objectId: waste.id, oldValue: { code: waste.code, wasteType: waste.wasteType } });
  await emitDomainEvent(input, waste.projectId, "Sustainability.Waste.Deleted", "WasteRecord", waste.id, { code: waste.code });
  return { wasteId: waste.id };
}