import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import {
  availableChecklistExecutionActions,
  availableCorrectiveActionActions,
  availableInspectionActions,
  availableNonConformityActions,
  availablePunchItemActions,
  isChecklistExecutionEditable,
  isCorrectiveActionEditable,
  isCorrectiveActionOpen,
  isInspectionEditable,
  isInspectionOpen,
  isNonConformityEditable,
  isNonConformityOpen,
  isPunchItemEditable,
  isPunchItemOpen,
  isPunchItemOverdue,
  parseChecklistItems,
  summarizeChecklistItems,
  summarizeQualityBoard,
  type ChecklistExecutionAction,
  type ChecklistExecutionStatus,
  type ChecklistItem,
  type ChecklistSummary,
  type CorrectiveActionAction,
  type CorrectiveActionStatus,
  type InspectionAction,
  type InspectionStatus,
  type NonConformityAction,
  type NonConformityStatus,
  type PunchItemAction,
  type PunchItemStatus,
  type QualityBoardCounts,
} from "@/modules/quality/engine";
import type { FieldPriority } from "@/modules/field/engine";
import { assertQualityProject } from "@/modules/quality/common";

// Leituras de qualidade (E13, §33/§34) — sempre escopadas pelo
// organization_id, mesmo padrão do módulo de campo.

function isoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function isoDateTime(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

async function resolveUserNames(ids: Set<string>): Promise<Map<string, string>> {
  if (ids.size === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, name: true },
  });
  return new Map(users.map((user) => [user.id, user.name]));
}

// ---------------------------------------------------------------------------
// Modelo de checklist (E13-US01)
// ---------------------------------------------------------------------------

export interface ChecklistTemplateRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  items: ChecklistItem[];
  itemCount: number;
  requiredCount: number;
  executionCount: number;
  createdAt: string;
  version: number;
}

export async function listChecklistTemplates(
  organizationId: string,
  projectId: string
): Promise<ChecklistTemplateRow[]> {
  await assertQualityProject(organizationId, projectId);
  const rows = await prisma.checklistTemplate.findMany({
    where: { organizationId, projectId, deletedAt: null },
    include: { executions: { where: { deletedAt: null }, select: { id: true } } },
    orderBy: [{ code: "asc" }],
  });

  return rows.map((row) => {
    const items = parseChecklistItems(row.items);
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      items,
      itemCount: items.length,
      requiredCount: items.filter((item) => item.required).length,
      executionCount: row.executions.length,
      createdAt: isoDateTime(row.createdAt)!,
      version: row.version,
    };
  });
}

export async function getChecklistTemplateRow(
  organizationId: string,
  templateId: string
): Promise<ChecklistTemplateRow> {
  const row = await prisma.checklistTemplate.findFirst({
    where: { id: templateId, organizationId, deletedAt: null },
    include: { executions: { where: { deletedAt: null }, select: { id: true } } },
  });
  if (!row) {
    throw new AppError("NOT_FOUND", "Modelo de checklist não encontrado nesta organização.");
  }
  const items = parseChecklistItems(row.items);
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    items,
    itemCount: items.length,
    requiredCount: items.filter((item) => item.required).length,
    executionCount: row.executions.length,
    createdAt: isoDateTime(row.createdAt)!,
    version: row.version,
  };
}

// ---------------------------------------------------------------------------
// Execução de checklist (E13-US01)
// ---------------------------------------------------------------------------

export interface ChecklistExecutionRow {
  id: string;
  code: string;
  templateId: string;
  templateCode: string;
  templateName: string;
  inspectionId: string | null;
  inspectionCode: string | null;
  inspectionTitle: string | null;
  status: ChecklistExecutionStatus;
  items: ChecklistItem[];
  summary: ChecklistSummary;
  inspectorId: string | null;
  inspectorName: string | null;
  notes: string | null;
  completedAt: string | null;
  cancelReason: string | null;
  actions: ChecklistExecutionAction[];
  editable: boolean;
  isOpen: boolean;
  version: number;
  createdAt: string;
}

interface ChecklistExecutionRecord {
  id: string;
  code: string;
  templateId: string;
  templateCode: string;
  templateName: string;
  inspectionId: string | null;
  inspection: { code: string; title: string } | null;
  status: ChecklistExecutionStatus;
  items: unknown;
  inspectorId: string | null;
  notes: string | null;
  completedAt: Date | null;
  cancelReason: string | null;
  version: number;
  createdAt: Date;
}

async function toExecutionRows(rows: ChecklistExecutionRecord[]): Promise<ChecklistExecutionRow[]> {
  const names = await resolveUserNames(
    new Set(rows.map((row) => row.inspectorId).filter((id): id is string => Boolean(id)))
  );
  return rows.map((row) => {
    const items = parseChecklistItems(row.items);
    return {
      id: row.id,
      code: row.code,
      templateId: row.templateId,
      templateCode: row.templateCode,
      templateName: row.templateName,
      inspectionId: row.inspectionId,
      inspectionCode: row.inspection?.code ?? null,
      inspectionTitle: row.inspection?.title ?? null,
      status: row.status,
      items,
      summary: summarizeChecklistItems(items),
      inspectorId: row.inspectorId,
      inspectorName: row.inspectorId ? names.get(row.inspectorId) ?? null : null,
      notes: row.notes,
      completedAt: isoDateTime(row.completedAt),
      cancelReason: row.cancelReason,
      actions: availableChecklistExecutionActions(row.status),
      editable: isChecklistExecutionEditable(row.status),
      isOpen: row.status === "DRAFT",
      version: row.version,
      createdAt: isoDateTime(row.createdAt)!,
    };
  });
}

const executionInclude = { inspection: { select: { code: true, title: true } } } as const;

export async function listChecklistExecutions(
  organizationId: string,
  projectId: string,
  filters?: { inspectionId?: string; status?: string }
): Promise<ChecklistExecutionRow[]> {
  await assertQualityProject(organizationId, projectId);
  const rows = await prisma.checklistExecution.findMany({
    where: {
      organizationId,
      projectId,
      deletedAt: null,
      ...(filters?.inspectionId ? { inspectionId: filters.inspectionId } : {}),
      ...(filters?.status ? { status: filters.status as ChecklistExecutionStatus } : {}),
    },
    include: executionInclude,
    orderBy: [{ code: "desc" }],
  });
  return toExecutionRows(rows);
}

export async function getChecklistExecutionRow(
  organizationId: string,
  executionId: string
): Promise<ChecklistExecutionRow> {
  const row = await prisma.checklistExecution.findFirst({
    where: { id: executionId, organizationId, deletedAt: null },
    include: executionInclude,
  });
  if (!row) {
    throw new AppError("NOT_FOUND", "Execução de checklist não encontrada nesta organização.");
  }
  return (await toExecutionRows([row]))[0];
}

// ---------------------------------------------------------------------------
// Inspeção (E13-US02, §33)
// ---------------------------------------------------------------------------

export interface InspectionRow {
  id: string;
  code: string;
  title: string;
  description: string | null;
  inspectionDate: string;
  status: InspectionStatus;
  inspectorId: string | null;
  inspectorName: string | null;
  wbsNodeId: string | null;
  wbsNodeCode: string | null;
  activityId: string | null;
  activityCode: string | null;
  criterion: string;
  resultNotes: string | null;
  executedAt: string | null;
  closedAt: string | null;
  cancelReason: string | null;
  photoCount: number;
  checklistCount: number;
  completedChecklistCount: number;
  hasEvidence: boolean;
  actions: InspectionAction[];
  editable: boolean;
  isOpen: boolean;
  version: number;
  createdAt: string;
}

interface InspectionRecord {
  id: string;
  code: string;
  title: string;
  description: string | null;
  inspectionDate: Date;
  status: InspectionStatus;
  inspectorId: string | null;
  wbsNodeId: string | null;
  wbsNode: { code: string } | null;
  activityId: string | null;
  activity: { code: string } | null;
  criterion: string;
  resultNotes: string | null;
  executedAt: Date | null;
  closedAt: Date | null;
  cancelReason: string | null;
  version: number;
  createdAt: Date;
  photos: { id: string }[];
  executions: { id: string; status: ChecklistExecutionStatus }[];
}

async function toInspectionRows(rows: InspectionRecord[]): Promise<InspectionRow[]> {
  const names = await resolveUserNames(
    new Set(rows.map((row) => row.inspectorId).filter((id): id is string => Boolean(id)))
  );
  return rows.map((row) => {
    const completed = row.executions.filter((item) => item.status === "COMPLETED").length;
    return {
      id: row.id,
      code: row.code,
      title: row.title,
      description: row.description,
      inspectionDate: isoDate(row.inspectionDate)!,
      status: row.status,
      inspectorId: row.inspectorId,
      inspectorName: row.inspectorId ? names.get(row.inspectorId) ?? null : null,
      wbsNodeId: row.wbsNodeId,
      wbsNodeCode: row.wbsNode?.code ?? null,
      activityId: row.activityId,
      activityCode: row.activity?.code ?? null,
      criterion: row.criterion,
      resultNotes: row.resultNotes,
      executedAt: isoDateTime(row.executedAt),
      closedAt: isoDateTime(row.closedAt),
      cancelReason: row.cancelReason,
      photoCount: row.photos.length,
      checklistCount: row.executions.length,
      completedChecklistCount: completed,
      hasEvidence: row.photos.length > 0 || completed > 0,
      actions: availableInspectionActions(row.status),
      editable: isInspectionEditable(row.status),
      isOpen: isInspectionOpen(row.status),
      version: row.version,
      createdAt: isoDateTime(row.createdAt)!,
    };
  });
}

const inspectionInclude = {
  wbsNode: { select: { code: true } },
  activity: { select: { code: true } },
  photos: { where: { deletedAt: null }, select: { id: true } },
  executions: {
    where: { deletedAt: null },
    select: { id: true, status: true },
  },
} as const;

export async function listInspections(
  organizationId: string,
  projectId: string,
  filters?: { status?: string }
): Promise<InspectionRow[]> {
  await assertQualityProject(organizationId, projectId);
  const rows = await prisma.inspection.findMany({
    where: {
      organizationId,
      projectId,
      deletedAt: null,
      ...(filters?.status ? { status: filters.status as InspectionStatus } : {}),
    },
    include: inspectionInclude,
    orderBy: [{ inspectionDate: "desc" }, { code: "asc" }],
  });
  return toInspectionRows(rows);
}

export async function getInspectionRow(
  organizationId: string,
  inspectionId: string
): Promise<InspectionRow> {
  const row = await prisma.inspection.findFirst({
    where: { id: inspectionId, organizationId, deletedAt: null },
    include: inspectionInclude,
  });
  if (!row) {
    throw new AppError("NOT_FOUND", "Inspeção não encontrada nesta organização.");
  }
  return (await toInspectionRows([row]))[0];
}

// ---------------------------------------------------------------------------
// Portfólio: resumo de qualidade por projeto
// ---------------------------------------------------------------------------

export interface QualitySummaryRow {
  projectId: string;
  projectCode: string;
  projectName: string;
  board: QualityBoardCounts;
}

export async function listQualitySummaries(
  organizationId: string
): Promise<QualitySummaryRow[]> {
  const [projects, templates, executions, inspections, nonConformities, correctiveActions, punchItems] =
    await Promise.all([
      prisma.project.findMany({
        where: { organizationId, deletedAt: null },
        select: { id: true, code: true, name: true },
      }),
      prisma.checklistTemplate.findMany({
        where: { organizationId, deletedAt: null },
        select: { id: true, projectId: true },
      }),
      prisma.checklistExecution.findMany({
        where: { organizationId, deletedAt: null },
        select: { id: true, projectId: true, status: true },
      }),
      prisma.inspection.findMany({
        where: { organizationId, deletedAt: null },
        select: { id: true, projectId: true, status: true },
      }),
      prisma.nonConformity.findMany({
        where: { organizationId, deletedAt: null },
        select: { id: true, projectId: true, status: true },
      }),
      prisma.correctiveAction.findMany({
        where: { organizationId, deletedAt: null },
        select: { id: true, projectId: true, status: true },
      }),
      prisma.punchItem.findMany({
        where: { organizationId, deletedAt: null },
        select: { id: true, projectId: true, status: true, dueDate: true },
      }),
    ]);

  return projects.map((project) => ({
    projectId: project.id,
    projectCode: project.code,
    projectName: project.name,
    board: summarizeQualityBoard({
      templates: templates.filter((item) => item.projectId === project.id),
      executions: executions.filter((item) => item.projectId === project.id),
      inspections: inspections.filter((item) => item.projectId === project.id),
      nonConformities: nonConformities.filter((item) => item.projectId === project.id),
      correctiveActions: correctiveActions.filter((item) => item.projectId === project.id),
      punchItems: punchItems.filter((item) => item.projectId === project.id),
    }),
  }));
}

// ---------------------------------------------------------------------------
// Não conformidade — NCR (E13-US03, §33)
// ---------------------------------------------------------------------------

export interface NonConformityRow {
  id: string;
  code: string;
  title: string;
  description: string;
  status: NonConformityStatus;
  inspectionId: string | null;
  inspectionCode: string | null;
  inspectionTitle: string | null;
  correctionNotes: string | null;
  verificationNotes: string | null;
  cancelReason: string | null;
  correctedAt: string | null;
  verifiedAt: string | null;
  closedAt: string | null;
  correctiveActionCount: number;
  openCorrectiveActionCount: number;
  actions: NonConformityAction[];
  editable: boolean;
  isOpen: boolean;
  version: number;
  createdAt: string;
}

interface NonConformityRecord {
  id: string;
  code: string;
  title: string;
  description: string;
  status: NonConformityStatus;
  inspectionId: string | null;
  inspection: { code: string; title: string } | null;
  correctionNotes: string | null;
  verificationNotes: string | null;
  cancelReason: string | null;
  correctedAt: Date | null;
  verifiedAt: Date | null;
  closedAt: Date | null;
  version: number;
  createdAt: Date;
  correctiveActions: { id: string; status: CorrectiveActionStatus }[];
}

const nonConformityInclude = {
  inspection: { select: { code: true, title: true } },
  correctiveActions: { where: { deletedAt: null }, select: { id: true, status: true } },
} as const;

function toNonConformityRow(row: NonConformityRecord): NonConformityRow {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    status: row.status,
    inspectionId: row.inspectionId,
    inspectionCode: row.inspection?.code ?? null,
    inspectionTitle: row.inspection?.title ?? null,
    correctionNotes: row.correctionNotes,
    verificationNotes: row.verificationNotes,
    cancelReason: row.cancelReason,
    correctedAt: isoDateTime(row.correctedAt),
    verifiedAt: isoDateTime(row.verifiedAt),
    closedAt: isoDateTime(row.closedAt),
    correctiveActionCount: row.correctiveActions.length,
    openCorrectiveActionCount: row.correctiveActions.filter((action) =>
      isCorrectiveActionOpen(action.status)
    ).length,
    actions: availableNonConformityActions(row.status),
    editable: isNonConformityEditable(row.status),
    isOpen: isNonConformityOpen(row.status),
    version: row.version,
    createdAt: isoDateTime(row.createdAt)!,
  };
}

export async function listNonConformities(
  organizationId: string,
  projectId: string,
  filters?: { status?: string; inspectionId?: string }
): Promise<NonConformityRow[]> {
  await assertQualityProject(organizationId, projectId);
  const rows = await prisma.nonConformity.findMany({
    where: {
      organizationId,
      projectId,
      deletedAt: null,
      ...(filters?.status ? { status: filters.status as NonConformityStatus } : {}),
      ...(filters?.inspectionId ? { inspectionId: filters.inspectionId } : {}),
    },
    include: nonConformityInclude,
    orderBy: [{ code: "desc" }],
  });
  return rows.map(toNonConformityRow);
}

export async function getNonConformityRow(
  organizationId: string,
  nonConformityId: string
): Promise<NonConformityRow> {
  const row = await prisma.nonConformity.findFirst({
    where: { id: nonConformityId, organizationId, deletedAt: null },
    include: nonConformityInclude,
  });
  if (!row) {
    throw new AppError("NOT_FOUND", "Não conformidade não encontrada nesta organização.");
  }
  return toNonConformityRow(row);
}

// ---------------------------------------------------------------------------
// Ação corretiva (E13-US04)
// ---------------------------------------------------------------------------

export interface CorrectiveActionRow {
  id: string;
  code: string;
  title: string;
  description: string;
  status: CorrectiveActionStatus;
  nonConformityId: string;
  nonConformityCode: string;
  nonConformityTitle: string;
  responsibleId: string | null;
  responsibleName: string | null;
  dueDate: string | null;
  actionNotes: string | null;
  verificationNotes: string | null;
  cancelReason: string | null;
  completedAt: string | null;
  verifiedAt: string | null;
  closedAt: string | null;
  actions: CorrectiveActionAction[];
  editable: boolean;
  isOpen: boolean;
  version: number;
  createdAt: string;
}

interface CorrectiveActionRecord {
  id: string;
  code: string;
  title: string;
  description: string;
  status: CorrectiveActionStatus;
  nonConformityId: string;
  nonConformity: { code: string; title: string };
  responsibleId: string | null;
  dueDate: Date | null;
  actionNotes: string | null;
  verificationNotes: string | null;
  cancelReason: string | null;
  completedAt: Date | null;
  verifiedAt: Date | null;
  closedAt: Date | null;
  version: number;
  createdAt: Date;
}

const correctiveActionInclude = {
  nonConformity: { select: { code: true, title: true } },
} as const;

async function toCorrectiveActionRows(
  rows: CorrectiveActionRecord[]
): Promise<CorrectiveActionRow[]> {
  const names = await resolveUserNames(
    new Set(rows.map((row) => row.responsibleId).filter((id): id is string => Boolean(id)))
  );
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    status: row.status,
    nonConformityId: row.nonConformityId,
    nonConformityCode: row.nonConformity.code,
    nonConformityTitle: row.nonConformity.title,
    responsibleId: row.responsibleId,
    responsibleName: row.responsibleId ? names.get(row.responsibleId) ?? null : null,
    dueDate: isoDate(row.dueDate),
    actionNotes: row.actionNotes,
    verificationNotes: row.verificationNotes,
    cancelReason: row.cancelReason,
    completedAt: isoDateTime(row.completedAt),
    verifiedAt: isoDateTime(row.verifiedAt),
    closedAt: isoDateTime(row.closedAt),
    actions: availableCorrectiveActionActions(row.status),
    editable: isCorrectiveActionEditable(row.status),
    isOpen: isCorrectiveActionOpen(row.status),
    version: row.version,
    createdAt: isoDateTime(row.createdAt)!,
  }));
}

export async function listCorrectiveActions(
  organizationId: string,
  projectId: string,
  filters?: { status?: string; nonConformityId?: string }
): Promise<CorrectiveActionRow[]> {
  await assertQualityProject(organizationId, projectId);
  const rows = await prisma.correctiveAction.findMany({
    where: {
      organizationId,
      projectId,
      deletedAt: null,
      ...(filters?.status ? { status: filters.status as CorrectiveActionStatus } : {}),
      ...(filters?.nonConformityId ? { nonConformityId: filters.nonConformityId } : {}),
    },
    include: correctiveActionInclude,
    orderBy: [{ code: "desc" }],
  });
  return toCorrectiveActionRows(rows);
}

export async function getCorrectiveActionRow(
  organizationId: string,
  correctiveActionId: string
): Promise<CorrectiveActionRow> {
  const row = await prisma.correctiveAction.findFirst({
    where: { id: correctiveActionId, organizationId, deletedAt: null },
    include: correctiveActionInclude,
  });
  if (!row) {
    throw new AppError("NOT_FOUND", "Ação corretiva não encontrada nesta organização.");
  }
  return (await toCorrectiveActionRows([row]))[0];
}

// ---------------------------------------------------------------------------
// Punch list (E13-US05, §34)
// ---------------------------------------------------------------------------

export interface PunchItemRow {
  id: string;
  code: string;
  location: string;
  description: string;
  priority: FieldPriority;
  status: PunchItemStatus;
  ownerId: string | null;
  ownerName: string | null;
  dueDate: string | null;
  overdue: boolean;
  wbsNodeId: string | null;
  wbsNodeCode: string | null;
  activityId: string | null;
  activityCode: string | null;
  photoEvidenceId: string | null;
  photoEvidenceCode: string | null;
  correctionEvidenceId: string | null;
  correctionEvidenceCode: string | null;
  verificationNotes: string | null;
  rejectReason: string | null;
  verifiedById: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  closedAt: string | null;
  actions: PunchItemAction[];
  editable: boolean;
  isOpen: boolean;
  version: number;
  createdAt: string;
}

interface PunchItemRecord {
  id: string;
  code: string;
  location: string;
  description: string;
  priority: FieldPriority;
  status: PunchItemStatus;
  ownerId: string | null;
  dueDate: Date | null;
  wbsNodeId: string | null;
  wbsNode: { code: string } | null;
  activityId: string | null;
  activity: { code: string } | null;
  photoEvidenceId: string | null;
  photoEvidence: { code: string } | null;
  correctionEvidenceId: string | null;
  correctionEvidence: { code: string } | null;
  verificationNotes: string | null;
  rejectReason: string | null;
  verifiedById: string | null;
  verifiedAt: Date | null;
  closedAt: Date | null;
  version: number;
  createdAt: Date;
}

const punchItemInclude = {
  wbsNode: { select: { code: true } },
  activity: { select: { code: true } },
  photoEvidence: { select: { code: true } },
  correctionEvidence: { select: { code: true } },
} as const;

async function toPunchItemRows(rows: PunchItemRecord[]): Promise<PunchItemRow[]> {
  const names = await resolveUserNames(
    new Set(
      rows
        .flatMap((row) => [row.ownerId, row.verifiedById])
        .filter((id): id is string => Boolean(id))
    )
  );
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    location: row.location,
    description: row.description,
    priority: row.priority,
    status: row.status,
    ownerId: row.ownerId,
    ownerName: row.ownerId ? names.get(row.ownerId) ?? null : null,
    dueDate: isoDate(row.dueDate),
    overdue: isPunchItemOverdue({ status: row.status, dueDate: row.dueDate }),
    wbsNodeId: row.wbsNodeId,
    wbsNodeCode: row.wbsNode?.code ?? null,
    activityId: row.activityId,
    activityCode: row.activity?.code ?? null,
    photoEvidenceId: row.photoEvidenceId,
    photoEvidenceCode: row.photoEvidence?.code ?? null,
    correctionEvidenceId: row.correctionEvidenceId,
    correctionEvidenceCode: row.correctionEvidence?.code ?? null,
    verificationNotes: row.verificationNotes,
    rejectReason: row.rejectReason,
    verifiedById: row.verifiedById,
    verifiedByName: row.verifiedById ? names.get(row.verifiedById) ?? null : null,
    verifiedAt: isoDateTime(row.verifiedAt),
    closedAt: isoDateTime(row.closedAt),
    actions: availablePunchItemActions(row.status),
    editable: isPunchItemEditable(row.status),
    isOpen: isPunchItemOpen(row.status),
    version: row.version,
    createdAt: isoDateTime(row.createdAt)!,
  }));
}

export async function listPunchItems(
  organizationId: string,
  projectId: string,
  filters?: { status?: string }
): Promise<PunchItemRow[]> {
  await assertQualityProject(organizationId, projectId);
  const rows = await prisma.punchItem.findMany({
    where: {
      organizationId,
      projectId,
      deletedAt: null,
      ...(filters?.status ? { status: filters.status as PunchItemStatus } : {}),
    },
    include: punchItemInclude,
    orderBy: [{ dueDate: "asc" }, { code: "asc" }],
  });
  return toPunchItemRows(rows);
}

export async function getPunchItemRow(
  organizationId: string,
  punchItemId: string
): Promise<PunchItemRow> {
  const row = await prisma.punchItem.findFirst({
    where: { id: punchItemId, organizationId, deletedAt: null },
    include: punchItemInclude,
  });
  if (!row) {
    throw new AppError("NOT_FOUND", "Item de punch list não encontrado nesta organização.");
  }
  return (await toPunchItemRows([row]))[0];
}
