import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { DEFAULT_CALENDAR, type CalendarSpec } from "@/modules/schedule/engine";

// Leituras do cronograma (E07, §27) — sempre escopadas pelo organization_id.

export interface ActivityRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  activityType: "TASK" | "MILESTONE" | "SUMMARY";
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "ON_HOLD" | "CANCELLED";
  duration: number;
  plannedStart: string | null;
  plannedFinish: string | null;
  actualStart: string | null;
  actualFinish: string | null;
  forecastStart: string | null;
  forecastFinish: string | null;
  progressMethod: "PERCENT_COMPLETE" | "PHYSICAL" | "UNITS";
  physicalProgress: number;
  critical: boolean;
  totalFloat: number | null;
  wbsNodeId: string | null;
  wbsNodeCode: string | null;
  wbsNodeName: string | null;
  calendarId: string | null;
  orderIndex: number;
  version: number;
}

export interface DependencyRow {
  id: string;
  predecessorId: string;
  successorId: string;
  type: "FS" | "SS" | "FF" | "SF";
  lag: number;
  predecessorCode: string;
  predecessorName: string;
  successorCode: string;
  successorName: string;
}

type ActivityRecord = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  activityType: "TASK" | "MILESTONE" | "SUMMARY";
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "ON_HOLD" | "CANCELLED";
  duration: number;
  plannedStart: Date | null;
  plannedFinish: Date | null;
  actualStart: Date | null;
  actualFinish: Date | null;
  forecastStart: Date | null;
  forecastFinish: Date | null;
  progressMethod: "PERCENT_COMPLETE" | "PHYSICAL" | "UNITS";
  physicalProgress: number;
  critical: boolean;
  totalFloat: number | null;
  wbsNodeId: string | null;
  calendarId: string | null;
  orderIndex: number;
  version: number;
  wbsNode: { code: string; name: string } | null;
};

function isoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export async function assertScheduleProject(organizationId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: null },
    select: { id: true, code: true, name: true, startDate: true },
  });
  if (!project) {
    throw new AppError("NOT_FOUND", "Projeto não encontrado nesta organização.");
  }
  return project;
}

const activitySelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  activityType: true,
  status: true,
  duration: true,
  plannedStart: true,
  plannedFinish: true,
  actualStart: true,
  actualFinish: true,
  forecastStart: true,
  forecastFinish: true,
  progressMethod: true,
  physicalProgress: true,
  critical: true,
  totalFloat: true,
  wbsNodeId: true,
  calendarId: true,
  orderIndex: true,
  version: true,
  wbsNode: { select: { code: true, name: true } },
} as const;

function toActivityRow(record: ActivityRecord): ActivityRow {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    description: record.description,
    activityType: record.activityType,
    status: record.status,
    duration: record.duration,
    plannedStart: isoDate(record.plannedStart),
    plannedFinish: isoDate(record.plannedFinish),
    actualStart: isoDate(record.actualStart),
    actualFinish: isoDate(record.actualFinish),
    forecastStart: isoDate(record.forecastStart),
    forecastFinish: isoDate(record.forecastFinish),
    progressMethod: record.progressMethod,
    physicalProgress: record.physicalProgress,
    critical: record.critical,
    totalFloat: record.totalFloat,
    wbsNodeId: record.wbsNodeId,
    wbsNodeCode: record.wbsNode?.code ?? null,
    wbsNodeName: record.wbsNode?.name ?? null,
    calendarId: record.calendarId,
    orderIndex: record.orderIndex,
    version: record.version,
  };
}

export async function listActivities(
  organizationId: string,
  projectId: string
): Promise<ActivityRow[]> {
  await assertScheduleProject(organizationId, projectId);
  const rows = await prisma.scheduleActivity.findMany({
    where: { organizationId, projectId, deletedAt: null },
    select: activitySelect,
    orderBy: [{ orderIndex: "asc" }, { code: "asc" }],
  });
  return (rows as unknown as ActivityRecord[]).map(toActivityRow);
}

export async function listDependencies(
  organizationId: string,
  projectId: string
): Promise<DependencyRow[]> {
  await assertScheduleProject(organizationId, projectId);
  const rows = await prisma.scheduleDependency.findMany({
    where: { organizationId, projectId },
    select: {
      id: true,
      predecessorId: true,
      successorId: true,
      type: true,
      lag: true,
      predecessor: { select: { code: true, name: true } },
      successor: { select: { code: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    predecessorId: row.predecessorId,
    successorId: row.successorId,
    type: row.type,
    lag: row.lag,
    predecessorCode: row.predecessor.code,
    predecessorName: row.predecessor.name,
    successorCode: row.successor.code,
    successorName: row.successor.name,
  }));
}

export async function getSchedule(organizationId: string, projectId: string) {
  const [activities, dependencies] = await Promise.all([
    listActivities(organizationId, projectId),
    listDependencies(organizationId, projectId),
  ]);
  return { activities, dependencies };
}

// Calendários do projeto (E07-US03): os do projeto + os da organização
// (projectId nulo) servem de base para as atividades que não definem o seu.
export async function loadCalendarSpecs(
  organizationId: string,
  projectId: string
): Promise<Record<string, CalendarSpec>> {
  const calendars = await prisma.projectCalendar.findMany({
    where: {
      organizationId,
      deletedAt: null,
      OR: [{ projectId }, { projectId: null }],
    },
    select: { id: true, workingWeek: true, holidays: true },
  });
  const specs: Record<string, CalendarSpec> = {};
  for (const calendar of calendars) {
    specs[calendar.id] = {
      workingWeek: Array.isArray(calendar.workingWeek)
        ? (calendar.workingWeek as number[])
        : DEFAULT_CALENDAR.workingWeek,
      holidays: Array.isArray(calendar.holidays) ? (calendar.holidays as string[]) : [],
    };
  }
  return specs;
}

function toSpec(workingWeek: unknown, holidays: unknown): CalendarSpec {
  return {
    workingWeek: Array.isArray(workingWeek) ? (workingWeek as number[]) : DEFAULT_CALENDAR.workingWeek,
    holidays: Array.isArray(holidays) ? (holidays as string[]) : [],
  };
}

// Default do projeto (E07-US03): o calendário `isDefault` do projeto, senão o
// da organização, senão null (o motor usa seg–sex).
export async function loadDefaultCalendarSpec(
  organizationId: string,
  projectId: string
): Promise<CalendarSpec | null> {
  const projectDefault = await prisma.projectCalendar.findFirst({
    where: { organizationId, projectId, isDefault: true, deletedAt: null },
    select: { workingWeek: true, holidays: true },
  });
  if (projectDefault) return toSpec(projectDefault.workingWeek, projectDefault.holidays);

  const orgDefault = await prisma.projectCalendar.findFirst({
    where: { organizationId, projectId: null, isDefault: true, deletedAt: null },
    select: { workingWeek: true, holidays: true },
  });
  return orgDefault ? toSpec(orgDefault.workingWeek, orgDefault.holidays) : null;
}

// Resumo do cronograma por projeto para a visão global /cronograma.
export interface ScheduleSummaryRow {
  projectId: string;
  activityCount: number;
  criticalCount: number;
  averageProgress: number;
  forecastFinish: string | null;
}

export async function listScheduleSummaries(
  organizationId: string
): Promise<ScheduleSummaryRow[]> {
  const [totals, critical] = await Promise.all([
    prisma.scheduleActivity.groupBy({
      by: ["projectId"],
      where: { organizationId, deletedAt: null },
      _count: { _all: true },
      _avg: { physicalProgress: true },
      _max: { forecastFinish: true },
    }),
    prisma.scheduleActivity.groupBy({
      by: ["projectId"],
      where: { organizationId, deletedAt: null, critical: true },
      _count: { _all: true },
    }),
  ]);

  const criticalByProject = new Map(critical.map((row) => [row.projectId, row._count._all]));
  return totals.map((row) => ({
    projectId: row.projectId,
    activityCount: row._count._all,
    criticalCount: criticalByProject.get(row.projectId) ?? 0,
    averageProgress: Math.round(row._avg.physicalProgress ?? 0),
    forecastFinish: row._max.forecastFinish ? isoDate(row._max.forecastFinish) : null,
  }));
}
