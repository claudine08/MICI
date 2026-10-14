import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { computeCpm, dateToDay } from "@/modules/schedule/engine";
import { recalculateSchedule, type CpmSummary } from "@/modules/schedule/cpm";
import { assertScheduleProject, loadCalendarSpecs, loadDefaultCalendarSpec } from "@/modules/schedule/selectors";
import type { ParsedSchedule } from "@/modules/schedule/msproject";

// Importação de cronograma MS Project (E07 import, §27): substitui o
// cronograma existente do projeto em uma transação (replace-all), refaz
// atividades/dependências com códigos A001.., religa o WBS pelo código,
// valida o grafo contra ciclos ANTES de escrever e recalcula o CPM depois.
// Também expõe "aplicar calendário ao cronograma": vincula o calendário a
// todas as atividades e persiste as datas do CPM (early) no planejado.

interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

function parseDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

async function assertCalendarScope(organizationId: string, calendarId: string) {
  const calendar = await prisma.projectCalendar.findFirst({
    where: { id: calendarId, organizationId, deletedAt: null },
    select: { id: true, projectId: true, code: true },
  });
  if (!calendar) {
    throw new AppError("VALIDATION_ERROR", "Calendário inválido nesta organização.");
  }
  return calendar;
}

export interface ScheduleImportSummary {
  sourceName: string;
  sourceFormat: "CSV" | "XML";
  activityCount: number;
  dependencyCount: number;
  milestoneCount: number;
  summaryCount: number;
  wbsLinkedCount: number;
  replacedActivities: number;
  projectStart: string | null;
  calendarId: string | null;
  warnings: string[];
  cpm: CpmSummary;
}

export interface ImportScheduleInput extends ActorContext {
  projectId: string;
  schedule: ParsedSchedule;
  calendarId?: string | null;
}

// Validação do grafo parseado antes da transação: ids únicos, dependências
// apontando para atividades existentes (não-resumo) e ciclo via computeCpm.
async function validateGraph(input: ImportScheduleInput) {
  const { schedule } = input;
  const warnings: string[] = [...schedule.warnings];

  const seen = new Set<string>();
  for (const task of schedule.tasks) {
    if (seen.has(task.sourceId)) {
      throw new AppError("VALIDATION_ERROR", `Id de atividade duplicado no arquivo: ${task.sourceId}.`);
    }
    seen.add(task.sourceId);
  }

  const byId = new Map(schedule.tasks.map((task) => [task.sourceId, task]));
  const summaryIds = new Set(
    schedule.tasks.filter((task) => task.type === "SUMMARY").map((task) => task.sourceId)
  );
  const errors: string[] = [];
  const edgeKeys = new Set<string>();
  const dependencies: {
    predecessorSourceId: string;
    successorSourceId: string;
    type: "FS" | "SS" | "FF" | "SF";
    lagDays: number;
  }[] = [];
  let dropped = 0;

  for (const dependency of schedule.dependencies) {
    const { predecessorSourceId, successorSourceId } = dependency;
    if (!byId.has(predecessorSourceId) || !byId.has(successorSourceId)) {
      if (errors.length < 20) {
        errors.push(`Dependência ${predecessorSourceId} → ${successorSourceId} referencia atividade inexistente.`);
      }
      continue;
    }
    if (summaryIds.has(predecessorSourceId) || summaryIds.has(successorSourceId)) {
      dropped += 1;
      continue;
    }
    if (predecessorSourceId === successorSourceId) {
      if (errors.length < 20) errors.push(`Atividade ${predecessorSourceId} depende de si mesma.`);
      continue;
    }
    const key = `${predecessorSourceId}>${successorSourceId}`;
    if (edgeKeys.has(key)) {
      dropped += 1;
      continue;
    }
    edgeKeys.add(key);
    dependencies.push(dependency);
  }
  if (errors.length > 0) {
    throw new AppError("VALIDATION_ERROR", "Cronograma inválido: dependências inconsistentes.", {
      details: { errors },
    });
  }
  if (dropped > 0) {
    warnings.push(`${dropped} dependência(s) ignoradas (resumo, repetida ou inválida).`);
  }

  // Ciclo: roda o motor com ids sintéticos antes de qualquer escrita.
  const project = await assertScheduleProject(input.organizationId, input.projectId);
  const [calendars, defaultCalendar] = await Promise.all([
    loadCalendarSpecs(input.organizationId, input.projectId),
    loadDefaultCalendarSpec(input.organizationId, input.projectId),
  ]);
  const earliest = schedule.tasks
    .map((task) => task.start)
    .filter((value): value is string => value !== null)
    .sort()[0];
  const projectStart = schedule.projectStart ?? earliest;
  try {
    computeCpm(
      schedule.tasks.map((task) => ({
        id: task.sourceId,
        code: task.sourceId,
        duration: task.durationDays,
        calendarKey: input.calendarId ?? null,
      })),
      dependencies.map((dependency) => ({
        predecessorId: dependency.predecessorSourceId,
        successorId: dependency.successorSourceId,
        type: dependency.type,
        lag: dependency.lagDays,
      })),
      {
        projectStart: projectStart ? dateToDay(projectStart) : dateToDay(project.startDate ?? new Date()),
        calendars,
        ...(defaultCalendar ? { defaultCalendar } : {}),
      }
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "VALIDATION_ERROR") {
      throw new AppError("VALIDATION_ERROR", "Cronograma inválido: ciclo de dependências no arquivo.", {
        details: error.details,
      });
    }
    throw error;
  }

  return { warnings, dependencies, project };
}

export async function importSchedule(input: ImportScheduleInput) {
  const { schedule } = input;
  const { warnings, dependencies, project } = await validateGraph(input);

  const calendarId = input.calendarId ?? null;
  if (calendarId) await assertCalendarScope(input.organizationId, calendarId);

  // Vínculo WBS: liga pela chave do arquivo ao código do nó do projeto.
  const wbsNodes = await prisma.wBSNode.findMany({
    where: { organizationId: input.organizationId, projectId: input.projectId, deletedAt: null },
    select: { id: true, code: true },
  });
  const wbsByCode = new Map(wbsNodes.map((node) => [node.code, node.id]));
  const missingWbs = new Set<string>();
  let wbsLinkedCount = 0;
  const wbsLinks = schedule.tasks.map((task) => {
    if (!task.wbs) return null;
    const nodeId = wbsByCode.get(task.wbs);
    if (nodeId) {
      wbsLinkedCount += 1;
      return nodeId;
    }
    missingWbs.add(task.wbs);
    return null;
  });
  if (missingWbs.size > 0) {
    warnings.push(
      `${missingWbs.size} código(s) de WBS do arquivo sem nó correspondente no projeto: ${[...missingWbs].slice(0, 5).join(", ")}.`
    );
  }

  const startValue =
    parseDay(schedule.projectStart) ??
    schedule.tasks.map((task) => parseDay(task.start)).find((value) => value !== null) ??
    null;

  const created: { id: string; task: (typeof schedule.tasks)[number] }[] = [];

  const replaced = await prisma.$transaction(async (tx) => {
    const previous = await tx.scheduleActivity.count({
      where: { organizationId: input.organizationId, projectId: input.projectId },
    });

    // Replace-all: apaga também as soft-deleted — o unique [projectId, code]
    // valeria para elas e impediria a renumeração A001..
    await tx.scheduleDependency.deleteMany({
      where: { organizationId: input.organizationId, projectId: input.projectId },
    });
    await tx.scheduleActivity.deleteMany({
      where: { organizationId: input.organizationId, projectId: input.projectId },
    });

    for (const [index, task] of schedule.tasks.entries()) {
      const plannedStart = parseDay(task.start);
      const plannedFinish = parseDay(task.finish);
      const status =
        task.percentComplete >= 100
          ? "COMPLETED"
          : task.percentComplete > 0
            ? "IN_PROGRESS"
            : "NOT_STARTED";
      const activity = await tx.scheduleActivity.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          code: `A${String(index + 1).padStart(3, "0")}`,
          name: task.name.slice(0, 200),
          description: task.notes?.slice(0, 2000) ?? null,
          activityType: task.type,
          duration: task.durationDays,
          plannedStart,
          plannedFinish,
          ...(status === "COMPLETED"
            ? { actualStart: plannedStart ?? plannedFinish ?? null, actualFinish: plannedFinish ?? plannedStart ?? null }
            : status === "IN_PROGRESS"
              ? { actualStart: plannedStart }
              : {}),
          wbsNodeId: wbsLinks[index],
          calendarId,
          physicalProgress: task.percentComplete,
          status,
          orderIndex: index,
          createdBy: input.actorId,
          updatedBy: input.actorId,
        },
      });
      created.push({ id: activity.id, task });
    }

    const idBySource = new Map(created.map((entry) => [entry.task.sourceId, entry.id]));
    const dependencyRows = dependencies.map((dependency) => ({
      organizationId: input.organizationId,
      projectId: input.projectId,
      predecessorId: idBySource.get(dependency.predecessorSourceId)!,
      successorId: idBySource.get(dependency.successorSourceId)!,
      type: dependency.type,
      lag: dependency.lagDays,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    }));
    if (dependencyRows.length > 0) {
      await tx.scheduleDependency.createMany({ data: dependencyRows });
    }

    // Âncora do projeto: import define o início quando o projeto ainda não tem.
    if (!project.startDate && startValue) {
      await tx.project.update({
        where: { id: input.projectId },
        data: { startDate: startValue, updatedBy: input.actorId },
      });
    }

    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        projectId: input.projectId,
        objectType: "ScheduleActivity",
        objectId: null,
        action: "IMPORT",
        newValue: {
          sourceName: schedule.sourceName,
          sourceFormat: schedule.sourceFormat,
          created: created.length,
          dependencies: dependencyRows.length,
          replacedActivities: previous,
          calendarId,
        },
        correlationId: input.correlationId ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
    await tx.domainEvent.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        actorId: input.actorId,
        eventType: "Schedule.Imported",
        aggregateType: "Project",
        aggregateId: input.projectId,
        payload: {
          sourceName: schedule.sourceName,
          activityCount: created.length,
          dependencyCount: dependencyRows.length,
        },
      },
    });

    return previous;
  });

  const cpm = await recalculateSchedule(input.organizationId, input.projectId);

  return {
    sourceName: schedule.sourceName,
    sourceFormat: schedule.sourceFormat,
    activityCount: created.length,
    dependencyCount: dependencies.length,
    milestoneCount: schedule.tasks.filter((task) => task.type === "MILESTONE").length,
    summaryCount: schedule.tasks.filter((task) => task.type === "SUMMARY").length,
    wbsLinkedCount,
    replacedActivities: replaced,
    projectStart: startValue ? startValue.toISOString().slice(0, 10) : null,
    calendarId,
    warnings,
    cpm,
  } satisfies ScheduleImportSummary;
}

export interface ApplyCalendarInput extends ActorContext {
  projectId: string;
  calendarId: string;
}

export interface ApplyCalendarSummary {
  calendarId: string;
  updatedActivities: number;
  cpm: CpmSummary;
}

// "Aplicar calendário ao cronograma": recalcula o CPM com o novo calendário e
// grava earlyStart/earlyFinish no planejado das atividades não concluídas —
// é o que muda as datas de início/fim das atividades e do projeto.
export async function applyCalendarToSchedule(
  input: ApplyCalendarInput
): Promise<ApplyCalendarSummary> {
  await assertScheduleProject(input.organizationId, input.projectId);
  const calendar = await assertCalendarScope(input.organizationId, input.calendarId);

  const linked = await prisma.scheduleActivity.updateMany({
    where: { organizationId: input.organizationId, projectId: input.projectId, deletedAt: null },
    data: { calendarId: input.calendarId, updatedBy: input.actorId, version: { increment: 1 } },
  });

  await prisma.$transaction(async (tx) => {
    // Calendário do projeto aplicado passa a ser o default dele (desliga os demais).
    if (calendar.projectId === input.projectId) {
      await tx.projectCalendar.updateMany({
        where: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          deletedAt: null,
          isDefault: true,
          id: { not: input.calendarId },
        },
        data: { isDefault: false },
      });
      await tx.projectCalendar.update({
        where: { id: input.calendarId },
        data: { isDefault: true, updatedBy: input.actorId, version: { increment: 1 } },
      });
    }
    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        projectId: input.projectId,
        objectType: "ScheduleActivity",
        objectId: null,
        action: "CALENDAR_APPLY",
        newValue: { calendarId: input.calendarId, calendarCode: calendar.code, activities: linked.count },
        correlationId: input.correlationId ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
    await tx.domainEvent.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        actorId: input.actorId,
        eventType: "Schedule.CalendarApplied",
        aggregateType: "Project",
        aggregateId: input.projectId,
        payload: { calendarId: input.calendarId, activities: linked.count },
      },
    });
  });

  const first = await recalculateSchedule(input.organizationId, input.projectId);

  // Persiste as datas do CPM no planejado (atividades ainda em andamento).
  const statusByCode = await prisma.scheduleActivity.findMany({
    where: { organizationId: input.organizationId, projectId: input.projectId, deletedAt: null },
    select: { id: true, status: true, plannedStart: true, plannedFinish: true },
  });
  const statusById = new Map(statusByCode.map((row) => [row.id, row]));
  let updatedActivities = 0;
  for (const node of first.nodes) {
    const row = statusById.get(node.id);
    if (!row || row.status === "COMPLETED" || row.status === "CANCELLED") continue;
    const nextStart = parseDay(node.earlyStart);
    const nextFinish = parseDay(node.earlyFinish);
    if (!nextStart || !nextFinish) continue;
    const unchanged =
      row.plannedStart?.getTime() === nextStart.getTime() &&
      row.plannedFinish?.getTime() === nextFinish.getTime();
    if (unchanged) continue;
    await prisma.scheduleActivity.update({
      where: { id: row.id },
      data: { plannedStart: nextStart, plannedFinish: nextFinish, updatedBy: input.actorId },
    });
    updatedActivities += 1;
  }

  const cpm = await recalculateSchedule(input.organizationId, input.projectId);
  return { calendarId: input.calendarId, updatedActivities, cpm };
}
