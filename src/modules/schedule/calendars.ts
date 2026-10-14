import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { recalculateSchedule } from "@/modules/schedule/cpm";
import { assertScheduleProject } from "@/modules/schedule/selectors";

// Calendários de trabalho (E07-US03, §27): semana útil (0=domingo…6=sábado)
// + feriados, com escopo por projeto ou por organização. O recálculo do CPM
// usa o default do projeto (senão o da organização, senão seg–sex).

interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

export interface CalendarRow {
  id: string;
  projectId: string | null;
  scope: "PROJECT" | "ORGANIZATION";
  code: string;
  name: string;
  workingWeek: number[];
  holidays: string[];
  isDefault: boolean;
  createdAt: string;
  version: number;
}

interface CalendarRecord {
  id: string;
  projectId: string | null;
  code: string;
  name: string;
  workingWeek: unknown;
  holidays: unknown;
  isDefault: boolean;
  createdAt: Date;
  version: number;
}

function toCalendarRow(record: CalendarRecord): CalendarRow {
  return {
    id: record.id,
    projectId: record.projectId,
    scope: record.projectId ? "PROJECT" : "ORGANIZATION",
    code: record.code,
    name: record.name,
    workingWeek: Array.isArray(record.workingWeek) ? (record.workingWeek as number[]) : [1, 2, 3, 4, 5],
    holidays: Array.isArray(record.holidays) ? (record.holidays as string[]) : [],
    isDefault: record.isDefault,
    createdAt: record.createdAt.toISOString(),
    version: record.version,
  };
}

function assertWorkingWeek(days: unknown) {
  if (!Array.isArray(days) || days.length < 1 || days.length > 7) {
    throw new AppError("VALIDATION_ERROR", "Semana de trabalho deve ter de 1 a 7 dias.");
  }
  if (new Set(days).size !== days.length) {
    throw new AppError("VALIDATION_ERROR", "Dias repetidos na semana de trabalho.");
  }
  for (const day of days) {
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new AppError("VALIDATION_ERROR", "Dia da semana inválido (use 0=domingo … 6=sábado).");
    }
  }
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function assertHolidays(dates: unknown) {
  if (!Array.isArray(dates)) {
    throw new AppError("VALIDATION_ERROR", "Feriados devem ser uma lista de datas AAAA-MM-DD.");
  }
  if (new Set(dates).size !== dates.length) {
    throw new AppError("VALIDATION_ERROR", "Feriado repetido.");
  }
  for (const date of dates) {
    const match = typeof date === "string" ? ISO_DATE.exec(date) : null;
    if (!match) {
      throw new AppError("VALIDATION_ERROR", "Feriado inválido (use AAAA-MM-DD).", {
        details: { holiday: date },
      });
    }
    const [, year, month, day] = match.map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
      throw new AppError("VALIDATION_ERROR", `Feriado inexistente no calendário: ${date}.`);
    }
  }
}

async function assertCodeAvailable(organizationId: string, code: string, exceptId?: string) {
  const existing = await prisma.projectCalendar.findFirst({
    where: { organizationId, code, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (existing) {
    throw new AppError("CONFLICT", `Código de calendário "${code}" já existe na organização.`);
  }
}

function audit(
  input: ActorContext,
  projectId: string | null,
  action: string,
  data: { objectId: string; oldValue?: unknown; newValue?: unknown }
) {
  return prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      projectId,
      objectType: "ProjectCalendar",
      objectId: data.objectId,
      action,
      ...(data.oldValue !== undefined ? { oldValue: data.oldValue as never } : {}),
      ...(data.newValue !== undefined ? { newValue: data.newValue as never } : {}),
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });
}

async function loadCalendar(organizationId: string, calendarId: string) {
  const calendar = await prisma.projectCalendar.findFirst({
    where: { id: calendarId, organizationId, deletedAt: null },
  });
  if (!calendar) {
    throw new AppError("NOT_FOUND", "Calendário não encontrado nesta organização.");
  }
  return calendar;
}

// Projetos afetados por uma mudança: quem usa o calendário + (se default)
// quem é alcançado pelo escopo.
async function affectedProjects(calendar: {
  id: string;
  organizationId: string;
  projectId: string | null;
  isDefault: boolean;
}): Promise<string[]> {
  const ids = new Set<string>();
  const linked = await prisma.scheduleActivity.findMany({
    where: { calendarId: calendar.id, deletedAt: null },
    distinct: ["projectId"],
    select: { projectId: true },
  });
  for (const row of linked) ids.add(row.projectId);
  if (calendar.isDefault) {
    if (calendar.projectId) {
      ids.add(calendar.projectId);
    } else {
      const projects = await prisma.project.findMany({
        where: { organizationId: calendar.organizationId, deletedAt: null },
        select: { id: true },
      });
      for (const project of projects) ids.add(project.id);
    }
  }
  return [...ids];
}

async function recalcProjects(organizationId: string, projectIds: string[]) {
  for (const projectId of projectIds) {
    await recalculateSchedule(organizationId, projectId);
  }
}

export async function listCalendars(organizationId: string, projectId: string): Promise<CalendarRow[]> {
  await assertScheduleProject(organizationId, projectId);
  const rows = await prisma.projectCalendar.findMany({
    where: {
      organizationId,
      deletedAt: null,
      OR: [{ projectId }, { projectId: null }],
    },
    orderBy: [{ projectId: "asc" }, { code: "asc" }],
  });
  return rows.map(toCalendarRow);
}

export interface CreateCalendarInput {
  projectId?: string | null; // null/ausente → escopo ORGANIZATION
  scope?: "PROJECT" | "ORGANIZATION";
  code: string;
  name: string;
  workingWeek?: number[];
  holidays?: string[];
  isDefault?: boolean;
}

export async function createCalendar(input: ActorContext & CreateCalendarInput) {
  const contextProjectId = input.projectId ?? null;
  if (contextProjectId) {
    await assertScheduleProject(input.organizationId, contextProjectId);
  }

  const scope = input.scope ?? "PROJECT";
  const projectId = scope === "ORGANIZATION" ? null : contextProjectId;
  if (scope === "PROJECT" && !projectId) {
    throw new AppError("VALIDATION_ERROR", "Calendário de projeto exige um projeto.");
  }

  const code = input.code.trim();
  const name = input.name.trim();
  const workingWeek = input.workingWeek ?? [1, 2, 3, 4, 5];
  const holidays = input.holidays ?? [];

  assertWorkingWeek(workingWeek);
  assertHolidays(holidays);
  await assertCodeAvailable(input.organizationId, code);

  const calendar = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.projectCalendar.updateMany({
        where: {
          organizationId: input.organizationId,
          projectId,
          deletedAt: null,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }
    return tx.projectCalendar.create({
      data: {
        organizationId: input.organizationId,
        projectId,
        code,
        name,
        workingWeek,
        holidays,
        isDefault: input.isDefault ?? false,
        createdBy: input.actorId,
      },
    });
  });

  await audit(input, projectId, "CREATE", {
    objectId: calendar.id,
    newValue: { code, name, scope, isDefault: calendar.isDefault },
  });

  await recalcProjects(
    input.organizationId,
    await affectedProjects({ ...calendar, organizationId: input.organizationId })
  );

  return toCalendarRow(calendar);
}

export interface UpdateCalendarInput {
  calendarId: string;
  code?: string;
  name?: string;
  workingWeek?: number[];
  holidays?: string[];
  isDefault?: boolean;
}

export async function updateCalendar(input: ActorContext & UpdateCalendarInput) {
  const calendar = await loadCalendar(input.organizationId, input.calendarId);

  const code = input.code !== undefined ? input.code.trim() : calendar.code;
  const name = input.name !== undefined ? input.name.trim() : calendar.name;
  const workingWeek = input.workingWeek !== undefined ? input.workingWeek : (calendar.workingWeek as number[]);
  const holidays = input.holidays !== undefined ? input.holidays : (calendar.holidays as string[]);
  const isDefault = input.isDefault !== undefined ? input.isDefault : calendar.isDefault;

  assertWorkingWeek(workingWeek);
  assertHolidays(holidays);
  if (code !== calendar.code) {
    await assertCodeAvailable(input.organizationId, code, calendar.id);
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (isDefault && !calendar.isDefault) {
      await tx.projectCalendar.updateMany({
        where: {
          organizationId: input.organizationId,
          projectId: calendar.projectId,
          deletedAt: null,
          isDefault: true,
          id: { not: calendar.id },
        },
        data: { isDefault: false },
      });
    }
    return tx.projectCalendar.update({
      where: { id: calendar.id },
      data: {
        code,
        name,
        workingWeek,
        holidays,
        isDefault,
        updatedBy: input.actorId,
        version: { increment: 1 },
      },
    });
  });

  await audit(input, calendar.projectId, "UPDATE", {
    objectId: calendar.id,
    oldValue: {
      code: calendar.code,
      workingWeek: calendar.workingWeek,
      holidays: calendar.holidays,
      isDefault: calendar.isDefault,
    },
    newValue: { code, workingWeek, holidays, isDefault },
  });

  await recalcProjects(input.organizationId, await affectedProjects(updated));
  return toCalendarRow(updated);
}

// BR — exclusão lógica bloqueada enquanto houver atividades usando o calendário.
export async function deleteCalendar(input: ActorContext & { calendarId: string }) {
  const calendar = await loadCalendar(input.organizationId, input.calendarId);

  const usage = await prisma.scheduleActivity.count({
    where: { organizationId: input.organizationId, calendarId: calendar.id, deletedAt: null },
  });
  if (usage > 0) {
    throw new AppError(
      "CONFLICT",
      `Calendário em uso por ${usage} atividade(s): troque o vínculo antes de excluir.`
    );
  }

  await prisma.projectCalendar.update({
    where: { id: calendar.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId },
  });

  await audit(input, calendar.projectId, "DELETE", {
    objectId: calendar.id,
    oldValue: { code: calendar.code, name: calendar.name },
  });

  if (calendar.isDefault) {
    await recalcProjects(
      input.organizationId,
      await affectedProjects({ ...calendar, isDefault: true })
    );
  }

  return { calendarId: calendar.id };
}
