import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { recalculateSchedule } from "@/modules/schedule/cpm";
import { assertScheduleProject } from "@/modules/schedule/selectors";

// Cronograma (E07-US01, §27): CRUD de atividades com vínculo WBS, validação
// de datas/marco, auditoria em toda escrita e recálculo do CPM após cada mutação.

interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

function audit(
  input: ActorContext,
  projectId: string,
  action: string,
  data: { oldValue?: unknown; newValue?: unknown; reason?: string | null; objectId?: string | null }
) {
  return prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      projectId,
      objectType: "ScheduleActivity",
      objectId: data.objectId ?? null,
      action,
      ...(data.oldValue !== undefined ? { oldValue: data.oldValue as never } : {}),
      ...(data.newValue !== undefined ? { newValue: data.newValue as never } : {}),
      reason: data.reason ?? null,
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });
}

function parseDay(value: string | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  return new Date(`${value}T00:00:00.000Z`);
}

async function loadLiveActivity(organizationId: string, activityId: string) {
  const activity = await prisma.scheduleActivity.findFirst({
    where: { id: activityId, organizationId, deletedAt: null },
  });
  if (!activity) {
    throw new AppError("NOT_FOUND", "Atividade não encontrada nesta organização.");
  }
  return activity;
}

async function assertWbsLink(organizationId: string, projectId: string, wbsNodeId: string | null) {
  if (!wbsNodeId) return;
  const node = await prisma.wBSNode.findFirst({
    where: { id: wbsNodeId, organizationId, projectId, deletedAt: null },
    select: { id: true },
  });
  if (!node) {
    throw new AppError("VALIDATION_ERROR", "Nó de WBS inválido para este projeto.");
  }
}

async function assertCalendar(organizationId: string, calendarId: string | null) {
  if (!calendarId) return;
  const calendar = await prisma.projectCalendar.findFirst({
    where: { id: calendarId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!calendar) {
    throw new AppError("VALIDATION_ERROR", "Calendário inválido nesta organização.");
  }
}

function assertDates(plannedStart: Date | null, plannedFinish: Date | null) {
  if (plannedStart && plannedFinish && plannedStart.getTime() > plannedFinish.getTime()) {
    throw new AppError("VALIDATION_ERROR", "Início planejado não pode ser posterior ao fim planejado.");
  }
}

function assertDuration(activityType: string, duration: number) {
  if (activityType === "MILESTONE" && duration !== 0) {
    throw new AppError("VALIDATION_ERROR", "Marco (MILESTONE) deve ter duração 0.");
  }
  if (duration < 0) {
    throw new AppError("VALIDATION_ERROR", "Duração não pode ser negativa.");
  }
}

async function nextActivityCode(projectId: string): Promise<string> {
  const codes = await prisma.scheduleActivity.findMany({
    where: { projectId },
    select: { code: true },
  });
  let max = 0;
  for (const { code } of codes) {
    const match = /^A(\d+)$/.exec(code);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `A${String(max + 1).padStart(3, "0")}`;
}

export interface CreateActivityInput {
  projectId: string;
  code?: string;
  name: string;
  description?: string;
  activityType?: "TASK" | "MILESTONE" | "SUMMARY";
  duration?: number;
  plannedStart?: string | null;
  plannedFinish?: string | null;
  wbsNodeId?: string | null;
  calendarId?: string | null;
  progressMethod?: "PERCENT_COMPLETE" | "PHYSICAL" | "UNITS";
  status?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "ON_HOLD" | "CANCELLED";
  orderIndex?: number;
}

export async function createActivity(input: ActorContext & CreateActivityInput) {
  await assertScheduleProject(input.organizationId, input.projectId);
  const activityType = input.activityType ?? "TASK";
  const duration = input.duration ?? (activityType === "TASK" ? 1 : 0);
  const plannedStart = parseDay(input.plannedStart);
  const plannedFinish = parseDay(input.plannedFinish);

  assertDuration(activityType, duration);
  assertDates(plannedStart, plannedFinish);
  await assertWbsLink(input.organizationId, input.projectId, input.wbsNodeId ?? null);
  await assertCalendar(input.organizationId, input.calendarId ?? null);

  let code = input.code?.trim();
  if (code) {
    const existing = await prisma.scheduleActivity.findFirst({
      where: { projectId: input.projectId, code },
      select: { id: true },
    });
    if (existing) {
      throw new AppError("CONFLICT", `Código de atividade "${code}" já existe no projeto.`);
    }
  } else {
    code = await nextActivityCode(input.projectId);
  }

  const orderIndex =
    input.orderIndex ??
    (await prisma.scheduleActivity.count({
      where: { organizationId: input.organizationId, projectId: input.projectId, deletedAt: null },
    }));

  const activity = await prisma.scheduleActivity.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      code,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      activityType,
      duration,
      plannedStart,
      plannedFinish,
      wbsNodeId: input.wbsNodeId ?? null,
      calendarId: input.calendarId ?? null,
      ...(input.progressMethod ? { progressMethod: input.progressMethod } : {}),
      ...(input.status ? { status: input.status } : {}),
      orderIndex,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });

  await prisma.$transaction(async (tx) => {
    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        projectId: input.projectId,
        objectType: "ScheduleActivity",
        objectId: activity.id,
        action: "CREATE",
        newValue: { code: activity.code, name: activity.name, duration: activity.duration },
        correlationId: input.correlationId ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
    await tx.domainEvent.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        actorId: input.actorId,
        eventType: "Schedule.ActivityCreated",
        aggregateType: "ScheduleActivity",
        aggregateId: activity.id,
        payload: { code: activity.code, name: activity.name },
      },
    });
  });

  await recalculateSchedule(input.organizationId, input.projectId);
  return activity;
}

export interface UpdateActivityInput {
  activityId: string;
  code?: string;
  name?: string;
  description?: string | null;
  activityType?: "TASK" | "MILESTONE" | "SUMMARY";
  duration?: number;
  plannedStart?: string | null;
  plannedFinish?: string | null;
  wbsNodeId?: string | null;
  calendarId?: string | null;
  progressMethod?: "PERCENT_COMPLETE" | "PHYSICAL" | "UNITS";
  status?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "ON_HOLD" | "CANCELLED";
}

export async function updateActivity(input: ActorContext & UpdateActivityInput) {
  const activity = await loadLiveActivity(input.organizationId, input.activityId);

  const activityType = input.activityType ?? activity.activityType;
  const duration = input.duration ?? activity.duration;
  const plannedStart =
    input.plannedStart !== undefined ? parseDay(input.plannedStart) : activity.plannedStart;
  const plannedFinish =
    input.plannedFinish !== undefined ? parseDay(input.plannedFinish) : activity.plannedFinish;

  assertDuration(activityType, duration);
  assertDates(plannedStart, plannedFinish);
  if (input.wbsNodeId !== undefined) {
    await assertWbsLink(input.organizationId, activity.projectId, input.wbsNodeId);
  }
  if (input.calendarId !== undefined) {
    await assertCalendar(input.organizationId, input.calendarId);
  }
  if (input.code !== undefined && input.code.trim() !== activity.code) {
    const existing = await prisma.scheduleActivity.findFirst({
      where: { projectId: activity.projectId, code: input.code.trim() },
      select: { id: true },
    });
    if (existing) {
      throw new AppError("CONFLICT", `Código de atividade "${input.code.trim()}" já existe no projeto.`);
    }
  }

  const updated = await prisma.scheduleActivity.update({
    where: { id: activity.id },
    data: {
      ...(input.code !== undefined ? { code: input.code.trim() } : {}),
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.activityType !== undefined ? { activityType } : {}),
      ...(input.duration !== undefined ? { duration } : {}),
      ...(input.plannedStart !== undefined ? { plannedStart } : {}),
      ...(input.plannedFinish !== undefined ? { plannedFinish } : {}),
      ...(input.wbsNodeId !== undefined ? { wbsNodeId: input.wbsNodeId } : {}),
      ...(input.calendarId !== undefined ? { calendarId: input.calendarId } : {}),
      ...(input.progressMethod !== undefined ? { progressMethod: input.progressMethod } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      updatedBy: input.actorId,
      version: { increment: 1 },
    },
  });

  await audit(input, activity.projectId, "UPDATE", {
    objectId: activity.id,
    oldValue: { code: activity.code, name: activity.name, duration: activity.duration },
    newValue: { code: updated.code, name: updated.name, duration: updated.duration },
  });

  await recalculateSchedule(input.organizationId, activity.projectId);
  return updated;
}

export interface UpdateProgressInput {
  activityId: string;
  physicalProgress: number;
  status?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "ON_HOLD" | "CANCELLED";
}

// E07-US01 — avanço físico da atividade; concluir força 100%.
export async function updateActivityProgress(input: ActorContext & UpdateProgressInput) {
  const activity = await loadLiveActivity(input.organizationId, input.activityId);
  const status = input.status ?? activity.status;
  const physicalProgress = status === "COMPLETED" ? 100 : input.physicalProgress;

  const updated = await prisma.scheduleActivity.update({
    where: { id: activity.id },
    data: {
      physicalProgress,
      status,
      ...(status === "COMPLETED" && !activity.actualFinish
        ? { actualFinish: new Date() }
        : {}),
      ...(status === "IN_PROGRESS" && !activity.actualStart ? { actualStart: new Date() } : {}),
      updatedBy: input.actorId,
      version: { increment: 1 },
    },
  });

  await audit(input, activity.projectId, "PROGRESS", {
    objectId: activity.id,
    oldValue: { physicalProgress: activity.physicalProgress, status: activity.status },
    newValue: { physicalProgress: updated.physicalProgress, status: updated.status },
  });

  // O forecast (E07-US05) deriva do realizado — recalcula a cada avanço.
  await recalculateSchedule(input.organizationId, activity.projectId);
  return updated;
}

// BR-010 — exclusão lógica bloqueada enquanto houver dependências.
export async function deleteActivity(input: ActorContext & { activityId: string }) {
  const activity = await loadLiveActivity(input.organizationId, input.activityId);

  const dependencyCount = await prisma.scheduleDependency.count({
    where: {
      organizationId: input.organizationId,
      projectId: activity.projectId,
      OR: [{ predecessorId: activity.id }, { successorId: activity.id }],
    },
  });
  if (dependencyCount > 0) {
    throw new AppError(
      "CONFLICT",
      `Atividade participa de ${dependencyCount} dependência(s): remova-as antes de excluir.`
    );
  }

  await prisma.scheduleActivity.update({
    where: { id: activity.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId },
  });

  await audit(input, activity.projectId, "DELETE", {
    objectId: activity.id,
    oldValue: { code: activity.code, name: activity.name },
  });

  await recalculateSchedule(input.organizationId, activity.projectId);
  return { activityId: activity.id };
}
