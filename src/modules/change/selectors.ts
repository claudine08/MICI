import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import {
  isChangeOpen,
  overallImpactSeverity,
  type ChangeDimension,
  type ChangeStatus,
  type ImpactSeverity,
} from "@/modules/change/engine";

// Leituras de mudanças (E11, §31) — sempre escopadas pelo organization_id.
// A severidade consolidada é DERIVADA na leitura pela maior severidade entre
// as dimensões avaliadas (mesma regra do nível de risco).

export async function assertChangeProject(organizationId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: null },
    select: { id: true, code: true, name: true },
  });
  if (!project) {
    throw new AppError("NOT_FOUND", "Projeto não encontrado nesta organização.");
  }
  return project;
}

function isoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function decimalToNumber(value: unknown): number | null {
  if (value === null) return null;
  return Number(value);
}

export interface ChangeImpactRow {
  id: string;
  dimension: ChangeDimension;
  severity: ImpactSeverity;
  notes: string | null;
  assessedById: string | null;
  assessedAt: string | null;
  updatedAt: string;
}

export interface ChangeRow {
  id: string;
  code: string;
  title: string;
  description: string | null;
  justification: string | null;
  category: ChangeDimension;
  status: ChangeStatus;
  isOpen: boolean;
  ownerId: string | null;
  ownerName: string | null;
  requestedById: string;
  requestedByName: string | null;
  dueDate: string | null;
  costDelta: number | null;
  scheduleDays: number | null;
  overallSeverity: ImpactSeverity;
  impactCount: number;
  implementationNotes: string | null;
  rejectReason: string | null;
  cancelReason: string | null;
  approvedAt: string | null;
  implementedAt: string | null;
  verifiedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  approvalCount: number;
  baselineCount: number;
  version: number;
}

interface ChangeRecord {
  id: string;
  code: string;
  title: string;
  description: string | null;
  justification: string | null;
  category: ChangeDimension;
  status: ChangeStatus;
  ownerId: string | null;
  requestedById: string;
  dueDate: Date | null;
  costDelta: unknown;
  scheduleDays: number | null;
  implementationNotes: string | null;
  rejectReason: string | null;
  cancelReason: string | null;
  approvedAt: Date | null;
  implementedAt: Date | null;
  verifiedAt: Date | null;
  closedAt: Date | null;
  cancelledAt: Date | null;
  impacts: { severity: ImpactSeverity }[];
  _count: { approvals: number; baselines: number };
  version: number;
}

async function resolveUserNames(userIds: Set<string>): Promise<Map<string, string>> {
  if (userIds.size === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: [...userIds] } },
    select: { id: true, name: true },
  });
  return new Map(users.map((user) => [user.id, user.name]));
}

function toChangeRow(row: ChangeRecord, userNames: Map<string, string>): ChangeRow {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    justification: row.justification,
    category: row.category,
    status: row.status,
    isOpen: isChangeOpen(row.status),
    ownerId: row.ownerId,
    ownerName: row.ownerId ? (userNames.get(row.ownerId) ?? null) : null,
    requestedById: row.requestedById,
    requestedByName: userNames.get(row.requestedById) ?? null,
    dueDate: isoDate(row.dueDate),
    costDelta: decimalToNumber(row.costDelta),
    scheduleDays: row.scheduleDays,
    overallSeverity: overallImpactSeverity(row.impacts.map((impact) => impact.severity)),
    impactCount: row.impacts.length,
    implementationNotes: row.implementationNotes,
    rejectReason: row.rejectReason,
    cancelReason: row.cancelReason,
    approvedAt: isoDate(row.approvedAt),
    implementedAt: isoDate(row.implementedAt),
    verifiedAt: isoDate(row.verifiedAt),
    closedAt: isoDate(row.closedAt),
    cancelledAt: isoDate(row.cancelledAt),
    approvalCount: row._count.approvals,
    baselineCount: row._count.baselines,
    version: row.version,
  };
}

const changeInclude = {
  impacts: { select: { severity: true } },
  _count: { select: { approvals: true, baselines: true } },
} as const;

async function rowsToChangeRows(rows: ChangeRecord[]): Promise<ChangeRow[]> {
  const userIds = new Set<string>();
  for (const row of rows) {
    if (row.ownerId) userIds.add(row.ownerId);
    userIds.add(row.requestedById);
  }
  const userNames = await resolveUserNames(userIds);
  return rows.map((row) => toChangeRow(row, userNames));
}

export async function listChanges(
  organizationId: string,
  projectId: string
): Promise<ChangeRow[]> {
  await assertChangeProject(organizationId, projectId);
  const rows = await prisma.changeRequest.findMany({
    where: { organizationId, projectId, deletedAt: null },
    include: changeInclude,
    orderBy: [{ createdAt: "desc" }, { code: "asc" }],
  });
  return rowsToChangeRows(rows);
}

export async function getChangeRow(
  organizationId: string,
  changeId: string
): Promise<ChangeRow> {
  const row = await prisma.changeRequest.findFirst({
    where: { id: changeId, organizationId, deletedAt: null },
    include: changeInclude,
  });
  if (!row) {
    throw new AppError("NOT_FOUND", "Mudança não encontrada nesta organização.");
  }
  const [change] = await rowsToChangeRows([row]);
  return change;
}

export async function listChangeImpacts(
  organizationId: string,
  changeId: string
): Promise<ChangeImpactRow[]> {
  const rows = await prisma.changeImpact.findMany({
    where: { organizationId, changeId },
    orderBy: { dimension: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    dimension: row.dimension,
    severity: row.severity,
    notes: row.notes,
    assessedById: row.assessedById,
    assessedAt: isoDate(row.assessedAt),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export interface ChangeApprovalRow {
  id: string;
  action: "APPROVE" | "REJECT";
  comment: string | null;
  approverId: string;
  approverName: string | null;
  createdAt: string;
}

export async function listChangeApprovals(
  organizationId: string,
  changeId: string
): Promise<ChangeApprovalRow[]> {
  const rows = await prisma.changeApproval.findMany({
    where: { organizationId, changeId },
    orderBy: { createdAt: "desc" },
  });
  const approverNames = await resolveUserNames(
    new Set(rows.map((row) => row.approverId))
  );
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    comment: row.comment,
    approverId: row.approverId,
    approverName: approverNames.get(row.approverId) ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export interface ChangeSummaryRow {
  projectId: string;
  totalCount: number;
  openCount: number;
  waitingApprovalCount: number;
  approvedCount: number;
  rejectedCount: number;
  highImpactCount: number;
}

// Resumo por projeto para a visão global /mudancas (altas severidades =
// consolidado HIGH/CRITICAL entre as dimensões avaliadas).
export async function listChangeSummaries(
  organizationId: string
): Promise<ChangeSummaryRow[]> {
  const changes = await prisma.changeRequest.findMany({
    where: { organizationId, deletedAt: null },
    select: {
      projectId: true,
      status: true,
      impacts: { select: { severity: true } },
    },
  });

  const byProject = new Map<string, ChangeSummaryRow>();
  for (const change of changes) {
    const summary = byProject.get(change.projectId) ?? {
      projectId: change.projectId,
      totalCount: 0,
      openCount: 0,
      waitingApprovalCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      highImpactCount: 0,
    };
    summary.totalCount += 1;
    if (isChangeOpen(change.status)) summary.openCount += 1;
    if (change.status === "WAITING_APPROVAL") summary.waitingApprovalCount += 1;
    if (change.status === "APPROVED") summary.approvedCount += 1;
    if (change.status === "REJECTED") summary.rejectedCount += 1;
    const severity = overallImpactSeverity(change.impacts.map((impact) => impact.severity));
    if (severity === "HIGH" || severity === "CRITICAL") summary.highImpactCount += 1;
    byProject.set(change.projectId, summary);
  }
  return [...byProject.values()];
}
