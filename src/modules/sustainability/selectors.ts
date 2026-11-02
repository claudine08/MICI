import { prisma } from "@/lib/prisma";
import { availableSustainabilityPlanActions, type SustainabilityPlanStatus } from "@/modules/sustainability/engine";
import { assertSustainabilityProject } from "@/modules/sustainability/common";

function isoDate(value: Date | null): string | null { return value ? value.toISOString().slice(0, 10) : null; }
function isoDateTime(value: Date | null): string | null { return value ? value.toISOString() : null; }
function toNum(v: unknown): number { return Number(v); }

export interface SustainabilityPlanRow { id: string; code: string; title: string; description: string | null; status: string; ownerId: string | null; ownerName: string | null; startDate: string | null; plannedEndDate: string | null; wbsNodeId: string | null; activityId: string | null; metricCount: number; availableActions: string[]; createdAt: string; version: number; }
export async function listSustainabilityPlans(orgId: string, projectId: string): Promise<SustainabilityPlanRow[]> {
  await assertSustainabilityProject(orgId, projectId);
  const rows = await prisma.sustainabilityPlan.findMany({ where: { organizationId: orgId, projectId, deletedAt: null }, include: { metrics: { where: { deletedAt: null }, select: { id: true } } }, orderBy: { code: "asc" } });
  const ownerIds = new Set(rows.map(r => r.ownerId).filter(Boolean) as string[]);
  const users = ownerIds.size ? await prisma.user.findMany({ where: { id: { in: [...ownerIds] } }, select: { id: true, name: true } }) : [];
  const nameMap = new Map(users.map(u => [u.id, u.name]));
  return rows.map(r => ({
    id: r.id, code: r.code, title: r.title, description: r.description, status: r.status,
    ownerId: r.ownerId, ownerName: r.ownerId ? nameMap.get(r.ownerId) ?? null : null,
    startDate: isoDate(r.startDate), plannedEndDate: isoDate(r.plannedEndDate),
    wbsNodeId: r.wbsNodeId, activityId: r.activityId, metricCount: r.metrics.length,
    availableActions: availableSustainabilityPlanActions(r.status as SustainabilityPlanStatus),
    createdAt: isoDateTime(r.createdAt)!, version: r.version,
  }));
}

export interface SustainabilityMetricRow { id: string; code: string; planId: string | null; name: string; unit: string; category: string | null; description: string | null; baselineCount: number; targetCount: number; measurementCount: number; createdAt: string; version: number; }
export async function listSustainabilityMetrics(orgId: string, projectId: string): Promise<SustainabilityMetricRow[]> {
  await assertSustainabilityProject(orgId, projectId);
  const rows = await prisma.sustainabilityMetric.findMany({ where: { organizationId: orgId, projectId, deletedAt: null }, include: { baselines: { where: { deletedAt: null }, select: { id: true } }, targets: { where: { deletedAt: null }, select: { id: true } }, measurements: { where: { deletedAt: null }, select: { id: true } } }, orderBy: { code: "asc" } });
  return rows.map(r => ({
    id: r.id, code: r.code, planId: r.planId, name: r.name, unit: r.unit, category: r.category, description: r.description,
    baselineCount: r.baselines.length, targetCount: r.targets.length, measurementCount: r.measurements.length,
    createdAt: isoDateTime(r.createdAt)!, version: r.version,
  }));
}

export interface SustainabilityBaselineRow { id: string; code: string; metricId: string; value: number; recordedAt: string; source: string | null; notes: string | null; createdAt: string; version: number; }
export async function listSustainabilityBaselines(orgId: string, projectId: string): Promise<SustainabilityBaselineRow[]> {
  await assertSustainabilityProject(orgId, projectId);
  const rows = await prisma.sustainabilityBaseline.findMany({ where: { organizationId: orgId, projectId, deletedAt: null }, orderBy: { code: "asc" } });
  return rows.map(r => ({ id: r.id, code: r.code, metricId: r.metricId, value: toNum(r.value), recordedAt: isoDate(r.recordedAt)!, source: r.source, notes: r.notes, createdAt: isoDateTime(r.createdAt)!, version: r.version }));
}

export interface SustainabilityTargetRow { id: string; code: string; metricId: string; targetValue: number; dueDate: string | null; notes: string | null; createdAt: string; version: number; }
export async function listSustainabilityTargets(orgId: string, projectId: string): Promise<SustainabilityTargetRow[]> {
  await assertSustainabilityProject(orgId, projectId);
  const rows = await prisma.sustainabilityTarget.findMany({ where: { organizationId: orgId, projectId, deletedAt: null }, orderBy: { code: "asc" } });
  return rows.map(r => ({ id: r.id, code: r.code, metricId: r.metricId, targetValue: toNum(r.targetValue), dueDate: isoDate(r.dueDate), notes: r.notes, createdAt: isoDateTime(r.createdAt)!, version: r.version }));
}

export interface SustainabilityMeasurementRow { id: string; code: string; metricId: string; value: number; measuredAt: string; wbsNodeId: string | null; activityId: string | null; notes: string | null; evidenceNotes: string | null; createdAt: string; version: number; }
export async function listSustainabilityMeasurements(orgId: string, projectId: string): Promise<SustainabilityMeasurementRow[]> {
  await assertSustainabilityProject(orgId, projectId);
  const rows = await prisma.sustainabilityMeasurement.findMany({ where: { organizationId: orgId, projectId, deletedAt: null }, orderBy: { code: "asc" } });
  return rows.map(r => ({ id: r.id, code: r.code, metricId: r.metricId, value: toNum(r.value), measuredAt: isoDate(r.measuredAt)!, wbsNodeId: r.wbsNodeId, activityId: r.activityId, notes: r.notes, evidenceNotes: r.evidenceNotes, createdAt: isoDateTime(r.createdAt)!, version: r.version }));
}

export interface WasteRecordRow { id: string; code: string; wasteType: string; quantity: number; unit: string; destination: string | null; recordedAt: string; wbsNodeId: string | null; activityId: string | null; notes: string | null; createdAt: string; version: number; }
export async function listWasteRecords(orgId: string, projectId: string): Promise<WasteRecordRow[]> {
  await assertSustainabilityProject(orgId, projectId);
  const rows = await prisma.wasteRecord.findMany({ where: { organizationId: orgId, projectId, deletedAt: null }, orderBy: { code: "asc" } });
  return rows.map(r => ({ id: r.id, code: r.code, wasteType: r.wasteType, quantity: toNum(r.quantity), unit: r.unit, destination: r.destination, recordedAt: isoDate(r.recordedAt)!, wbsNodeId: r.wbsNodeId, activityId: r.activityId, notes: r.notes, createdAt: isoDateTime(r.createdAt)!, version: r.version }));
}