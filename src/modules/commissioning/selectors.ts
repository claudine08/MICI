import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import {
  availableAcceptanceActions,
  availableCommissioningItemActions,
  availableCommissioningPlanActions,
  type AcceptanceStatus,
  type CommissioningItemStatus,
  type CommissioningPlanStatus,
} from "@/modules/commissioning/engine";
import { assertCommissioningProject } from "@/modules/commissioning/common";

function isoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}
function isoDateTime(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

// ---------------------------------------------------------------------------
// Planos
// ---------------------------------------------------------------------------
export interface CommissioningPlanRow {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: CommissioningPlanStatus;
  ownerId: string | null;
  ownerName: string | null;
  startDate: string | null;
  plannedEndDate: string | null;
  wbsNodeId: string | null;
  activityId: string | null;
  itemCount: number;
  passedCount: number;
  failedCount: number;
  availableActions: string[];
  createdAt: string;
  version: number;
}

export async function listCommissioningPlans(
  organizationId: string,
  projectId: string
): Promise<CommissioningPlanRow[]> {
  await assertCommissioningProject(organizationId, projectId);
  const rows = await prisma.commissioningPlan.findMany({
    where: { organizationId, projectId, deletedAt: null },
    include: { items: { where: { deletedAt: null }, select: { status: true } } },
    orderBy: [{ code: "asc" }],
  });
  const ownerIds = new Set(rows.map((r) => r.ownerId).filter(Boolean) as string[]);
  const users = ownerIds.size
    ? await prisma.user.findMany({ where: { id: { in: [...ownerIds] } }, select: { id: true, name: true } })
    : [];
  const nameMap = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    status: row.status as CommissioningPlanStatus,
    ownerId: row.ownerId,
    ownerName: row.ownerId ? nameMap.get(row.ownerId) ?? null : null,
    startDate: isoDate(row.startDate),
    plannedEndDate: isoDate(row.plannedEndDate),
    wbsNodeId: row.wbsNodeId,
    activityId: row.activityId,
    itemCount: row.items.length,
    passedCount: row.items.filter((i) => i.status === "PASSED" || i.status === "ACCEPTED").length,
    failedCount: row.items.filter((i) => i.status === "FAILED").length,
    availableActions: availableCommissioningPlanActions(row.status as CommissioningPlanStatus),
    createdAt: isoDateTime(row.createdAt)!,
    version: row.version,
  }));
}

export async function getCommissioningPlanRow(organizationId: string, planId: string) {
  const row = await prisma.commissioningPlan.findFirst({
    where: { id: planId, organizationId, deletedAt: null },
    include: { items: { where: { deletedAt: null }, orderBy: { code: "asc" } } },
  });
  if (!row) throw new AppError("NOT_FOUND", "Plano de comissionamento não encontrado nesta organização.");
  return row;
}

// ---------------------------------------------------------------------------
// Itens
// ---------------------------------------------------------------------------
export interface CommissioningItemRow {
  id: string;
  code: string;
  planId: string;
  title: string;
  description: string | null;
  systemName: string | null;
  testMethod: string | null;
  acceptanceCriteria: string | null;
  status: CommissioningItemStatus;
  result: string | null;
  notes: string | null;
  rejectReason: string | null;
  retestCount: number;
  evidencePhotoId: string | null;
  evidenceNotes: string | null;
  executedById: string | null;
  executedByName: string | null;
  executedAt: string | null;
  verifiedAt: string | null;
  acceptedAt: string | null;
  wbsNodeId: string | null;
  activityId: string | null;
  availableActions: string[];
  createdAt: string;
  version: number;
}

export async function listCommissioningItems(
  organizationId: string,
  projectId: string,
  planId?: string
): Promise<CommissioningItemRow[]> {
  await assertCommissioningProject(organizationId, projectId);
  const rows = await prisma.commissioningItem.findMany({
    where: { organizationId, projectId, deletedAt: null, ...(planId ? { planId } : {}) },
    orderBy: [{ code: "asc" }],
  });
  const userIds = new Set(rows.map((r) => r.executedById).filter(Boolean) as string[]);
  const users = userIds.size
    ? await prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true } })
    : [];
  const nameMap = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    planId: row.planId,
    title: row.title,
    description: row.description,
    systemName: row.systemName,
    testMethod: row.testMethod,
    acceptanceCriteria: row.acceptanceCriteria,
    status: row.status as CommissioningItemStatus,
    result: row.result,
    notes: row.notes,
    rejectReason: row.rejectReason,
    retestCount: row.retestCount,
    evidencePhotoId: row.evidencePhotoId,
    evidenceNotes: row.evidenceNotes,
    executedById: row.executedById,
    executedByName: row.executedById ? nameMap.get(row.executedById) ?? null : null,
    executedAt: isoDateTime(row.executedAt),
    verifiedAt: isoDateTime(row.verifiedAt),
    acceptedAt: isoDateTime(row.acceptedAt),
    wbsNodeId: row.wbsNodeId,
    activityId: row.activityId,
    availableActions: availableCommissioningItemActions(row.status as CommissioningItemStatus),
    createdAt: isoDateTime(row.createdAt)!,
    version: row.version,
  }));
}

// ---------------------------------------------------------------------------
// Aceites
// ---------------------------------------------------------------------------
export interface AcceptanceRow {
  id: string;
  code: string;
  commissioningPlanId: string | null;
  scope: string;
  status: AcceptanceStatus;
  acceptedById: string | null;
  acceptedByName: string | null;
  acceptedAt: string | null;
  notes: string | null;
  rejectReason: string | null;
  wbsNodeId: string | null;
  activityId: string | null;
  documentId: string | null;
  availableActions: string[];
  createdAt: string;
  version: number;
}

export async function listAcceptances(
  organizationId: string,
  projectId: string
): Promise<AcceptanceRow[]> {
  await assertCommissioningProject(organizationId, projectId);
  const rows = await prisma.acceptance.findMany({
    where: { organizationId, projectId, deletedAt: null },
    orderBy: [{ code: "asc" }],
  });
  const userIds = new Set(rows.map((r) => r.acceptedById).filter(Boolean) as string[]);
  const users = userIds.size
    ? await prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true } })
    : [];
  const nameMap = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    commissioningPlanId: row.commissioningPlanId,
    scope: row.scope,
    status: row.status as AcceptanceStatus,
    acceptedById: row.acceptedById,
    acceptedByName: row.acceptedById ? nameMap.get(row.acceptedById) ?? null : null,
    acceptedAt: isoDateTime(row.acceptedAt),
    notes: row.notes,
    rejectReason: row.rejectReason,
    wbsNodeId: row.wbsNodeId,
    activityId: row.activityId,
    documentId: row.documentId,
    availableActions: availableAcceptanceActions(row.status as AcceptanceStatus),
    createdAt: isoDateTime(row.createdAt)!,
    version: row.version,
  }));
}