import { prisma } from "@/lib/prisma";
import {
  computeCpm,
  computeForecast,
  dateToDay,
  dayToIso,
  type CpmDependency,
  type ForecastActual,
} from "@/modules/schedule/engine";
import { assertScheduleProject, loadCalendarSpecs, loadDefaultCalendarSpec } from "@/modules/schedule/selectors";

// Recálculo do caminho crítico (E07-US06, §27): recalcula SEMPRE antes de
// persistir — `critical`/`total_float` nunca são tratados como verdade própria.
// Junta o forecast (E07-US05): datas previstas a partir do realizado, também
// recalculadas e persistidas a cada recálculo.

export interface CpmNodeSummary {
  id: string;
  code: string;
  earlyStart: string;
  earlyFinish: string;
  lateStart: string;
  lateFinish: string;
  forecastStart: string;
  forecastFinish: string;
  totalFloat: number;
  critical: boolean;
  changed: boolean;
}

export interface CpmSummary {
  projectStart: string;
  projectFinish: string;
  forecastFinish: string;
  activityCount: number;
  criticalCount: number;
  nodes: CpmNodeSummary[];
}

export async function recalculateSchedule(
  organizationId: string,
  projectId: string
): Promise<CpmSummary> {
  const project = await assertScheduleProject(organizationId, projectId);

  const [activities, dependencies, calendars, defaultCalendar] = await Promise.all([
    prisma.scheduleActivity.findMany({
      where: { organizationId, projectId, deletedAt: null },
      select: {
        id: true,
        code: true,
        duration: true,
        calendarId: true,
        plannedStart: true,
        totalFloat: true,
        critical: true,
        status: true,
        actualStart: true,
        actualFinish: true,
        physicalProgress: true,
        forecastStart: true,
        forecastFinish: true,
      },
      orderBy: [{ orderIndex: "asc" }, { code: "asc" }],
    }),
    prisma.scheduleDependency.findMany({
      where: { organizationId, projectId },
      select: { predecessorId: true, successorId: true, type: true, lag: true },
    }),
    loadCalendarSpecs(organizationId, projectId),
    loadDefaultCalendarSpec(organizationId, projectId),
  ]);

  const earliestPlan = activities
    .map((activity) => activity.plannedStart)
    .filter((value): value is Date => value !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const startValue = project.startDate ?? earliestPlan ?? new Date();
  const projectStart = dateToDay(startValue);

  const cpmInput = activities.map((activity) => ({
    id: activity.id,
    code: activity.code,
    duration: activity.duration,
    calendarKey: activity.calendarId,
  }));
  const options = {
    projectStart,
    calendars,
    // Default do projeto/organização (E07-US03); sem nenhum, seg–sex.
    ...(defaultCalendar ? { defaultCalendar } : {}),
  };

  const result = computeCpm(cpmInput, dependencies as CpmDependency[], options);

  const actuals: Record<string, ForecastActual> = {};
  for (const activity of activities) {
    actuals[activity.id] = {
      status: activity.status,
      actualStart: activity.actualStart ? dateToDay(activity.actualStart) : null,
      actualFinish: activity.actualFinish ? dateToDay(activity.actualFinish) : null,
      physicalProgress: activity.physicalProgress,
    };
  }
  const forecast = computeForecast(cpmInput, dependencies as CpmDependency[], {
    ...options,
    actuals,
  });

  const nodes: CpmNodeSummary[] = [];
  for (const activity of activities) {
    const node = result.nodes.get(activity.id);
    const predicted = forecast.nodes.get(activity.id);
    if (!node || !predicted) continue;
    const forecastStartIso = dayToIso(predicted.forecastStart);
    const forecastFinishIso = dayToIso(predicted.forecastFinish);
    const changed =
      activity.totalFloat !== node.totalFloat ||
      activity.critical !== node.critical ||
      activity.forecastStart?.toISOString().slice(0, 10) !== forecastStartIso ||
      activity.forecastFinish?.toISOString().slice(0, 10) !== forecastFinishIso;
    if (changed) {
      await prisma.scheduleActivity.update({
        where: { id: activity.id },
        data: {
          totalFloat: node.totalFloat,
          critical: node.critical,
          forecastStart: new Date(`${forecastStartIso}T00:00:00.000Z`),
          forecastFinish: new Date(`${forecastFinishIso}T00:00:00.000Z`),
        },
      });
    }
    nodes.push({
      id: activity.id,
      code: activity.code,
      earlyStart: dayToIso(node.earlyStart),
      earlyFinish: dayToIso(node.earlyFinish),
      lateStart: dayToIso(node.lateStart),
      lateFinish: dayToIso(node.lateFinish),
      forecastStart: forecastStartIso,
      forecastFinish: forecastFinishIso,
      totalFloat: node.totalFloat,
      critical: node.critical,
      changed,
    });
  }

  return {
    projectStart: dayToIso(projectStart),
    projectFinish: dayToIso(result.projectFinish),
    forecastFinish: dayToIso(forecast.projectFinish),
    activityCount: activities.length,
    criticalCount: nodes.filter((node) => node.critical).length,
    nodes,
  };
}
