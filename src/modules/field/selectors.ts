import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import {
  isConstraintOverdue,
  isTaskOverdue,
  summarizeFieldBoard,
  type ConstraintStatus,
  type ConstraintType,
  type DiaryStatus,
  type FieldPriority,
  type FieldBoardCounts,
  type ProgressLevel,
  type ProgressMethodValue,
  type TaskStatus,
} from "@/modules/field/engine";

// Leituras de campo (E12, §38) — sempre escopadas pelo organization_id.

export async function assertFieldProject(organizationId: string, projectId: string) {
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

function isoDateTime(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Semana corrente (segunda a domingo) para o quadro de campo (§38).
function weekEndIso(today: string): string {
  const date = new Date(`${today}T00:00:00.000Z`);
  const day = date.getUTCDay();
  const daysToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(date.getTime() - daysToMonday * 86_400_000);
  return new Date(monday.getTime() + 6 * 86_400_000).toISOString().slice(0, 10);
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
// Diário de obra
// ---------------------------------------------------------------------------

export interface DiaryRow {
  id: string;
  code: string;
  entryDate: string;
  status: DiaryStatus;
  team: string | null;
  workHours: number | null;
  activities: string | null;
  progressNotes: string | null;
  equipment: string | null;
  materials: string | null;
  occurrences: string | null;
  constraintNotes: string | null;
  conditions: string | null;
  inspections: string | null;
  safety: string | null;
  visitors: string | null;
  decisions: string | null;
  water: number | null;
  energy: number | null;
  wasteNotes: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectReason: string | null;
  photoCount: number;
  taskCount: number;
  isOpen: boolean;
  version: number;
}

function toDiaryRow(row: {
  id: string;
  code: string;
  entryDate: Date;
  status: DiaryStatus;
  team: string | null;
  workHours: unknown;
  activities: string | null;
  progressNotes: string | null;
  equipment: string | null;
  materials: string | null;
  occurrences: string | null;
  constraintNotes: string | null;
  conditions: string | null;
  inspections: string | null;
  safety: string | null;
  visitors: string | null;
  decisions: string | null;
  water: unknown;
  energy: unknown;
  wasteNotes: string | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  rejectReason: string | null;
  version: number;
  photos: { id: string }[];
  tasks: { id: string }[];
}): DiaryRow {
  return {
    id: row.id,
    code: row.code,
    entryDate: isoDate(row.entryDate)!,
    status: row.status,
    team: row.team,
    workHours: row.workHours === null ? null : Number(row.workHours),
    activities: row.activities,
    progressNotes: row.progressNotes,
    equipment: row.equipment,
    materials: row.materials,
    occurrences: row.occurrences,
    constraintNotes: row.constraintNotes,
    conditions: row.conditions,
    inspections: row.inspections,
    safety: row.safety,
    visitors: row.visitors,
    decisions: row.decisions,
    water: row.water === null ? null : Number(row.water),
    energy: row.energy === null ? null : Number(row.energy),
    wasteNotes: row.wasteNotes,
    submittedAt: isoDateTime(row.submittedAt),
    approvedAt: isoDateTime(row.approvedAt),
    rejectReason: row.rejectReason,
    photoCount: row.photos.length,
    taskCount: row.tasks.length,
    isOpen: row.status !== "APPROVED" && row.status !== "CANCELLED",
    version: row.version,
  };
}

const diaryInclude = {
  photos: { where: { deletedAt: null }, select: { id: true } },
  tasks: { where: { deletedAt: null }, select: { id: true } },
} as const;

export async function listDiaries(organizationId: string, projectId: string): Promise<DiaryRow[]> {
  await assertFieldProject(organizationId, projectId);
  const rows = await prisma.fieldDiary.findMany({
    where: { organizationId, projectId, deletedAt: null },
    include: diaryInclude,
    orderBy: [{ entryDate: "desc" }, { code: "asc" }],
  });
  return rows.map(toDiaryRow);
}

export async function getDiaryRow(
  organizationId: string,
  diaryId: string
): Promise<DiaryRow> {
  const row = await prisma.fieldDiary.findFirst({
    where: { id: diaryId, organizationId, deletedAt: null },
    include: diaryInclude,
  });
  if (!row) {
    throw new AppError("NOT_FOUND", "Diário não encontrado nesta organização.");
  }
  return toDiaryRow(row);
}

// ---------------------------------------------------------------------------
// Tarefa de campo
// ---------------------------------------------------------------------------

export interface TaskRow {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: FieldPriority;
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: string | null;
  isOverdue: boolean;
  wbsNodeId: string | null;
  wbsNodeCode: string | null;
  activityId: string | null;
  activityCode: string | null;
  diaryId: string | null;
  diaryCode: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelReason: string | null;
  isOpen: boolean;
  version: number;
}

interface TaskRecord {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: FieldPriority;
  assigneeId: string | null;
  dueDate: Date | null;
  wbsNodeId: string | null;
  wbsNode: { code: string } | null;
  activityId: string | null;
  activity: { code: string } | null;
  diaryId: string | null;
  diary: { code: string } | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelReason: string | null;
  version: number;
}

async function toTaskRows(rows: TaskRecord[]): Promise<TaskRow[]> {
  const names = await resolveUserNames(
    new Set(rows.map((row) => row.assigneeId).filter((id): id is string => Boolean(id)))
  );
  const today = todayIso();
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assigneeId: row.assigneeId,
    assigneeName: row.assigneeId ? names.get(row.assigneeId) ?? null : null,
    dueDate: isoDate(row.dueDate),
    isOverdue: isTaskOverdue(row.status, isoDate(row.dueDate), today),
    wbsNodeId: row.wbsNodeId,
    wbsNodeCode: row.wbsNode?.code ?? null,
    activityId: row.activityId,
    activityCode: row.activity?.code ?? null,
    diaryId: row.diaryId,
    diaryCode: row.diary?.code ?? null,
    startedAt: isoDateTime(row.startedAt),
    completedAt: isoDateTime(row.completedAt),
    cancelReason: row.cancelReason,
    isOpen: row.status !== "DONE" && row.status !== "CANCELLED",
    version: row.version,
  }));
}

const taskInclude = {
  wbsNode: { select: { code: true } },
  activity: { select: { code: true } },
  diary: { select: { code: true } },
} as const;

export async function listTasks(organizationId: string, projectId: string): Promise<TaskRow[]> {
  await assertFieldProject(organizationId, projectId);
  const rows = await prisma.fieldTask.findMany({
    where: { organizationId, projectId, deletedAt: null },
    include: taskInclude,
    orderBy: [{ dueDate: "asc" }, { code: "asc" }],
  });
  return toTaskRows(rows);
}

export async function getTaskRow(organizationId: string, taskId: string): Promise<TaskRow> {
  const row = await prisma.fieldTask.findFirst({
    where: { id: taskId, organizationId, deletedAt: null },
    include: taskInclude,
  });
  if (!row) {
    throw new AppError("NOT_FOUND", "Tarefa não encontrada nesta organização.");
  }
  return (await toTaskRows([row]))[0];
}

// ---------------------------------------------------------------------------
// Restrição
// ---------------------------------------------------------------------------

export interface ConstraintRow {
  id: string;
  code: string;
  title: string;
  description: string | null;
  type: ConstraintType;
  priority: FieldPriority;
  status: ConstraintStatus;
  ownerId: string | null;
  ownerName: string | null;
  dueDate: string | null;
  isOverdue: boolean;
  wbsNodeId: string | null;
  wbsNodeCode: string | null;
  activityId: string | null;
  activityCode: string | null;
  identifiedAt: string | null;
  removedAt: string | null;
  resolution: string | null;
  cancelReason: string | null;
  isOpen: boolean;
  version: number;
}

interface ConstraintRecord {
  id: string;
  code: string;
  title: string;
  description: string | null;
  type: ConstraintType;
  priority: FieldPriority;
  status: ConstraintStatus;
  ownerId: string | null;
  dueDate: Date | null;
  wbsNodeId: string | null;
  wbsNode: { code: string } | null;
  activityId: string | null;
  activity: { code: string } | null;
  identifiedAt: Date | null;
  removedAt: Date | null;
  resolution: string | null;
  cancelReason: string | null;
  version: number;
}

async function toConstraintRows(rows: ConstraintRecord[]): Promise<ConstraintRow[]> {
  const names = await resolveUserNames(
    new Set(rows.map((row) => row.ownerId).filter((id): id is string => Boolean(id)))
  );
  const today = todayIso();
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    type: row.type,
    priority: row.priority,
    status: row.status,
    ownerId: row.ownerId,
    ownerName: row.ownerId ? names.get(row.ownerId) ?? null : null,
    dueDate: isoDate(row.dueDate),
    isOverdue: isConstraintOverdue(row.status, isoDate(row.dueDate), today),
    wbsNodeId: row.wbsNodeId,
    wbsNodeCode: row.wbsNode?.code ?? null,
    activityId: row.activityId,
    activityCode: row.activity?.code ?? null,
    identifiedAt: isoDateTime(row.identifiedAt),
    removedAt: isoDateTime(row.removedAt),
    resolution: row.resolution,
    cancelReason: row.cancelReason,
    isOpen: row.status === "OPEN" || row.status === "ADDRESSED",
    version: row.version,
  }));
}

const constraintInclude = {
  wbsNode: { select: { code: true } },
  activity: { select: { code: true } },
} as const;

export async function listConstraints(
  organizationId: string,
  projectId: string
): Promise<ConstraintRow[]> {
  await assertFieldProject(organizationId, projectId);
  const rows = await prisma.constraint.findMany({
    where: { organizationId, projectId, deletedAt: null },
    include: constraintInclude,
    orderBy: [{ dueDate: "asc" }, { code: "asc" }],
  });
  return toConstraintRows(rows);
}

export async function getConstraintRow(
  organizationId: string,
  constraintId: string
): Promise<ConstraintRow> {
  const row = await prisma.constraint.findFirst({
    where: { id: constraintId, organizationId, deletedAt: null },
    include: constraintInclude,
  });
  if (!row) {
    throw new AppError("NOT_FOUND", "Restrição não encontrada nesta organização.");
  }
  return (await toConstraintRows([row]))[0];
}

// ---------------------------------------------------------------------------
// Fotos (metadados — o binário fica só no download)
// ---------------------------------------------------------------------------

export interface PhotoRow {
  id: string;
  code: string;
  caption: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  hash: string;
  takenAt: string | null;
  diaryId: string | null;
  diaryCode: string | null;
  wbsNodeId: string | null;
  activityId: string | null;
  createdAt: string;
  version: number;
}

export async function listPhotos(
  organizationId: string,
  projectId: string,
  diaryId?: string
): Promise<PhotoRow[]> {
  await assertFieldProject(organizationId, projectId);
  const rows = await prisma.photoEvidence.findMany({
    where: {
      organizationId,
      projectId,
      deletedAt: null,
      ...(diaryId ? { diaryId } : {}),
    },
    include: { diary: { select: { code: true } } },
    orderBy: [{ takenAt: "desc" }, { code: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    caption: row.caption,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    hash: row.hash,
    takenAt: isoDateTime(row.takenAt),
    diaryId: row.diaryId,
    diaryCode: row.diary?.code ?? null,
    wbsNodeId: row.wbsNodeId,
    activityId: row.activityId,
    createdAt: isoDateTime(row.createdAt)!,
    version: row.version,
  }));
}

export async function getPhotoContent(
  organizationId: string,
  photoId: string
): Promise<{ fileName: string; mimeType: string; sizeBytes: number; hash: string; content: Buffer }> {
  const row = await prisma.photoEvidence.findFirst({
    where: { id: photoId, organizationId, deletedAt: null },
  });
  if (!row) {
    throw new AppError("NOT_FOUND", "Foto não encontrada nesta organização.");
  }
  return {
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    hash: row.hash,
    content: Buffer.from(row.content),
  };
}

// ---------------------------------------------------------------------------
// Medição de avanço físico (E12-US04, BR-006)
// ---------------------------------------------------------------------------

export interface ProgressRow {
  id: string;
  code: string;
  measurementDate: string;
  level: ProgressLevel;
  wbsNodeId: string | null;
  wbsNodeCode: string | null;
  activityId: string | null;
  activityCode: string | null;
  method: ProgressMethodValue;
  progressPercent: number;
  quantityPlanned: number | null;
  quantityReal: number | null;
  unit: string | null;
  criterion: string;
  notes: string | null;
  createdAt: string;
  version: number;
}

interface ProgressRecord {
  id: string;
  code: string;
  measurementDate: Date;
  level: ProgressLevel;
  wbsNodeId: string | null;
  wbsNode: { code: string } | null;
  activityId: string | null;
  activity: { code: string } | null;
  method: ProgressMethodValue;
  progressPercent: number;
  quantityPlanned: number | null;
  quantityReal: number | null;
  unit: string | null;
  criterion: string;
  notes: string | null;
  createdAt: Date;
  version: number;
}

function toProgressRow(row: ProgressRecord): ProgressRow {
  return {
    id: row.id,
    code: row.code,
    measurementDate: isoDate(row.measurementDate)!,
    level: row.level,
    wbsNodeId: row.wbsNodeId,
    wbsNodeCode: row.wbsNode?.code ?? null,
    activityId: row.activityId,
    activityCode: row.activity?.code ?? null,
    method: row.method,
    progressPercent: row.progressPercent,
    quantityPlanned: row.quantityPlanned,
    quantityReal: row.quantityReal,
    unit: row.unit,
    criterion: row.criterion,
    notes: row.notes,
    createdAt: isoDateTime(row.createdAt)!,
    version: row.version,
  };
}

const progressInclude = {
  wbsNode: { select: { code: true } },
  activity: { select: { code: true } },
} as const;

export async function listProgress(
  organizationId: string,
  projectId: string,
  filters?: { activityId?: string; wbsNodeId?: string }
): Promise<ProgressRow[]> {
  await assertFieldProject(organizationId, projectId);
  const rows = await prisma.progressMeasurement.findMany({
    where: {
      organizationId,
      projectId,
      deletedAt: null,
      ...(filters?.activityId ? { activityId: filters.activityId } : {}),
      ...(filters?.wbsNodeId ? { wbsNodeId: filters.wbsNodeId } : {}),
    },
    include: progressInclude,
    orderBy: [{ measurementDate: "desc" }, { code: "asc" }],
  });
  return rows.map(toProgressRow);
}

export async function getProgressRow(
  organizationId: string,
  progressId: string
): Promise<ProgressRow> {
  const row = await prisma.progressMeasurement.findFirst({
    where: { id: progressId, organizationId, deletedAt: null },
    include: progressInclude,
  });
  if (!row) {
    throw new AppError("NOT_FOUND", "Medição não encontrada nesta organização.");
  }
  return toProgressRow(row);
}

// ---------------------------------------------------------------------------
// Home de campo (§38): Hoje / Esta semana / Atrasadas / Restrições
// ---------------------------------------------------------------------------

export interface FieldSummaryRow {
  projectId: string;
  projectCode: string;
  projectName: string;
  board: FieldBoardCounts;
  approvedDiaries: number;
  openTasks: number;
  // Avanço físico médio das atividades (BR-006: nunca do financeiro).
  physicalAverage: number;
  measurementCount: number;
}

export async function listFieldSummaries(organizationId: string): Promise<FieldSummaryRow[]> {
  const [projects, diaries, tasks, constraints, activities, measurements] = await Promise.all([
    prisma.project.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, code: true, name: true },
    }),
    prisma.fieldDiary.findMany({
      where: { organizationId, deletedAt: null },
      select: { projectId: true, entryDate: true, status: true },
    }),
    prisma.fieldTask.findMany({
      where: { organizationId, deletedAt: null },
      select: { projectId: true, status: true, dueDate: true },
    }),
    prisma.constraint.findMany({
      where: { organizationId, deletedAt: null },
      select: { projectId: true, status: true },
    }),
    prisma.scheduleActivity.findMany({
      where: { organizationId, deletedAt: null },
      select: { projectId: true, physicalProgress: true, status: true },
    }),
    prisma.progressMeasurement.findMany({
      where: { organizationId, deletedAt: null },
      select: { projectId: true },
    }),
  ]);

  const today = todayIso();
  const weekEnd = weekEndIso(today);

  return projects.map((project) => {
    const projectDiaries = diaries.filter((d) => d.projectId === project.id);
    const projectTasks = tasks.filter((t) => t.projectId === project.id);
    const projectConstraints = constraints.filter((c) => c.projectId === project.id);
    const projectActivities = activities.filter((a) => a.projectId === project.id);
    const projectMeasurements = measurements.filter((m) => m.projectId === project.id);

    const activeActivities = projectActivities.filter(
      (activity) => activity.status !== "CANCELLED"
    );
    const physicalAverage =
      activeActivities.length === 0
        ? 0
        : Math.round(
            activeActivities.reduce((sum, activity) => sum + activity.physicalProgress, 0) /
              activeActivities.length
          );

    return {
      projectId: project.id,
      projectCode: project.code,
      projectName: project.name,
      board: summarizeFieldBoard({
        diaryEntries: projectDiaries.map((d) => ({
          entryDate: isoDate(d.entryDate)!,
        })),
        tasks: projectTasks.map((t) => ({
          status: t.status as TaskStatus,
          dueDate: isoDate(t.dueDate),
        })),
        constraints: projectConstraints.map((c) => ({
          status: c.status as ConstraintStatus,
        })),
        today,
        weekEnd,
      }),
      approvedDiaries: projectDiaries.filter((d) => d.status === "APPROVED").length,
      openTasks: projectTasks.filter((t) => t.status !== "DONE" && t.status !== "CANCELLED")
        .length,
      physicalAverage,
      measurementCount: projectMeasurements.length,
    };
  });
}
