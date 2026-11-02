import { prisma } from "@/lib/prisma";

export interface ProjectDashboardKpis {
  bac: number;
  pv: number;
  ev: number;
  ac: number;
  plannedPct: number;
  actualPct: number;
  spi: number | null;
  cpi: number | null;
  physicalProgress: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
}

export interface CurvePoint {
  month: string;
  pv: number;
  ev: number;
  ac: number;
}

export interface BurndownPoint {
  month: string;
  remaining: number;
  total: number;
}

export interface GanttRow {
  code: string;
  name: string;
  start: string | null;
  end: string | null;
  duration: number;
  critical: boolean;
  float: number;
  progress: number;
}

export interface RiskCell {
  probability: number;
  impact: number;
  count: number;
}

export interface ProjectDashboard {
  asOf: string;
  kpis: ProjectDashboardKpis;
  curve: CurvePoint[];
  burndown: BurndownPoint[];
  gantt: GanttRow[];
  riskHeatmap: RiskCell[];
  alerts: string[];
}

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}

function timePhasedPv(start: Date | null, end: Date | null, bac: number, asOf: Date): number {
  if (!start || !end || bac <= 0) return 0;
  if (asOf.getTime() <= start.getTime()) return 0;
  if (asOf.getTime() >= end.getTime()) return bac;
  const total = daysBetween(start, end);
  if (total <= 0) return bac;
  const elapsed = daysBetween(start, asOf);
  const ratio = Math.min(1, Math.max(0, elapsed / total));
  return Math.round(bac * ratio * 100) / 100;
}

function monthsBetween(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last) {
    out.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

export async function getProjectDashboard(
  organizationId: string,
  projectId: string,
  asOfDate: string
): Promise<ProjectDashboard> {
  const asOf = new Date(`${asOfDate}T00:00:00.000Z`);

  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: null },
    select: { id: true, code: true, name: true, status: true, currentPhase: true, startDate: true, plannedEndDate: true },
  });
  if (!project) throw new Error("Projeto não encontrado.");

  // Cost
  const items = await prisma.costItem.findMany({
    where: { projectId, organizationId, deletedAt: null },
    select: { amount: true },
  });
  const bac = items.reduce((s, i) => s + Number(i.amount), 0);
  const actuals = await prisma.costActual.findMany({
    where: { projectId, organizationId, deletedAt: null },
    select: { amount: true, incurredAt: true },
  });
  const ac = actuals.reduce((s, a) => s + Number(a.amount), 0);

  // Schedule
  const acts = await prisma.scheduleActivity.findMany({
    where: { projectId, organizationId, deletedAt: null },
    select: { code: true, name: true, plannedStart: true, plannedFinish: true, actualStart: true, actualFinish: true, duration: true, critical: true, totalFloat: true, physicalProgress: true, status: true },
    orderBy: { plannedStart: "asc" },
  });
  const physicalProgress = acts.length > 0
    ? Math.round((acts.reduce((s, a) => s + (a.physicalProgress ?? 0), 0) / acts.length) * 100) / 100
    : 0;
  const ev = Math.round(bac * (physicalProgress / 100) * 100) / 100;
  const pv = timePhasedPv(project.startDate, project.plannedEndDate, bac, asOf);

  const plannedPct = bac > 0 ? Math.round((pv / bac) * 10000) / 100 : 0;
  const actualPct = bac > 0 ? Math.round((ev / bac) * 10000) / 100 : 0;
  const spi = pv > 0 ? Math.round((ev / pv) * 100) / 100 : null;
  const cpi = ac > 0 ? Math.round((ev / ac) * 100) / 100 : null;

  // Actual start/end (min/max de atividades concluídas? usar atividades com progress=100)
  const completedActs = acts.filter((a) => (a.physicalProgress ?? 0) >= 100 && a.actualFinish);
  const actualStart = completedActs.length > 0
    ? completedActs.reduce((min, a) => (!min || (a.actualStart && a.actualStart < min) ? a.actualStart! : min), null as Date | null)
    : null;
  const actualEnd = completedActs.length > 0
    ? completedActs.reduce((max, a) => (!max || (a.actualFinish && a.actualFinish > max) ? a.actualFinish! : max), null as Date | null)
    : null;

  const kpis: ProjectDashboardKpis = {
    bac,
    pv,
    ev,
    ac,
    plannedPct,
    actualPct,
    spi,
    cpi,
    physicalProgress,
    plannedStart: project.startDate ? project.startDate.toISOString().slice(0, 10) : null,
    plannedEnd: project.plannedEndDate ? project.plannedEndDate.toISOString().slice(0, 10) : null,
    actualStart: actualStart ? actualStart.toISOString().slice(0, 10) : null,
    actualEnd: actualEnd ? actualEnd.toISOString().slice(0, 10) : null,
  };

  // Curva S (mensal)
  const curveStart = project.startDate ?? new Date(asOf);
  const curveEnd = project.plannedEndDate ?? asOf;
  const months = monthsBetween(curveStart, curveEnd);
  const curve: CurvePoint[] = months.map((m) => {
    const monthEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0);
    const pvM = timePhasedPv(project.startDate, project.plannedEndDate, bac, monthEnd);
    // EV/AC: patamar até asOf
    const evM = monthEnd.getTime() <= asOf.getTime() ? ev : ev;
    const acM = monthEnd.getTime() <= asOf.getTime() ? ac : ac;
    return {
      month: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`,
      pv: pvM,
      ev: evM,
      ac: acM,
    };
  });

  // Burndown
  const totalActs = acts.length;
  const burndown: BurndownPoint[] = months.map((m) => {
    const monthEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0);
    const done = acts.filter((a) => (a.physicalProgress ?? 0) >= 100 && a.plannedFinish && a.plannedFinish.getTime() <= monthEnd.getTime()).length;
    return {
      month: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`,
      remaining: Math.max(0, totalActs - done),
      total: totalActs,
    };
  });

  // Gantt
  const gantt: GanttRow[] = acts.map((a) => ({
    code: a.code,
    name: a.name,
    start: a.plannedStart ? a.plannedStart.toISOString().slice(0, 10) : null,
    end: a.plannedFinish ? a.plannedFinish.toISOString().slice(0, 10) : null,
    duration: a.duration ?? 0,
    critical: a.critical ?? false,
    float: a.totalFloat ?? 0,
    progress: a.physicalProgress ?? 0,
  }));

  // Risk heatmap
  const risks = await prisma.risk.findMany({
    where: { projectId, organizationId, deletedAt: null },
    select: { probability: true, impact: true },
  });
  const cellMap = new Map<string, number>();
  for (const r of risks) {
    const p = r.probability ?? 1;
    const i = r.impact ?? 1;
    const key = `${p}-${i}`;
    cellMap.set(key, (cellMap.get(key) ?? 0) + 1);
  }
  const riskHeatmap: RiskCell[] = [];
  for (let p = 1; p <= 5; p++) {
    for (let i = 1; i <= 5; i++) {
      riskHeatmap.push({ probability: p, impact: i, count: cellMap.get(`${p}-${i}`) ?? 0 });
    }
  }

  // Alertas
  const alerts: string[] = [];
  if (spi !== null && spi < 0.9) alerts.push(`Atraso: SPI ${spi} (< 0.9).`);
  if (cpi !== null && cpi < 0.9) alerts.push(`Sobrecusto: CPI ${cpi} (< 0.9).`);
  if (project.plannedEndDate && asOf > project.plannedEndDate && physicalProgress < 100) {
    alerts.push(`Projeto ultrapassou a data de término planejada com ${physicalProgress}% de avanço.`);
  }
  const criticalRisks = risks.filter((r) => (r.probability ?? 0) >= 4 && (r.impact ?? 0) >= 4).length;
  if (criticalRisks > 0) alerts.push(`${criticalRisks} risco(s) crítico(s) (prob≥4, impacto≥4).`);
  if (alerts.length === 0) alerts.push("Sem alertas críticos.");

  return { asOf: asOfDate, kpis, curve, burndown, gantt, riskHeatmap, alerts };
}