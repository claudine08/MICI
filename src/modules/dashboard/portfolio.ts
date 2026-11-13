import { prisma } from "@/lib/prisma";

export interface ProjectDashboardRow {
  id: string;
  code: string;
  name: string;
  status: string;
  currentPhase: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  physicalProgress: number;
  bac: number;
  pv: number;
  ev: number;
  ac: number;
  plannedPct: number;
  actualPct: number;
  spi: number | null;
  cpi: number | null;
  openRfis: number;
  openPunchItems: number;
  riskCount: number;
  riskTitles: string[];
  delayed: boolean;
  delayedActivities: string[];
}

export interface PortfolioDashboard {
  asOf: string;
  kpis: {
    totalProjects: number;
    delayedProjects: number;
    totalBac: number;
    totalPv: number;
    totalEv: number;
    totalAc: number;
    spi: number | null;
    cpi: number | null;
    openRfis: number;
    openPunchItems: number;
    totalRisks: number;
  };
  projects: ProjectDashboardRow[];
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

export async function getPortfolioDashboard(
  organizationId: string,
  asOfDate: string
): Promise<PortfolioDashboard> {
  const asOf = new Date(`${asOfDate}T00:00:00.000Z`);

  const projects = await prisma.project.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: [{ code: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      currentPhase: true,
      startDate: true,
      plannedEndDate: true,
    },
  });

  const rows: ProjectDashboardRow[] = [];
  let totalBac = 0;
  let totalPv = 0;
  let totalEv = 0;
  let totalAc = 0;
  let totalDelayed = 0;
  let totalOpenRfis = 0;
  let totalOpenPunchItems = 0;
  let totalRisks = 0;

  for (const p of projects) {
    // BAC = soma CostItem.amount
    const items = await prisma.costItem.findMany({
      where: { projectId: p.id, organizationId, deletedAt: null },
      select: { amount: true },
    });
    const bac = items.reduce((s, i) => s + Number(i.amount), 0);

    // AC = soma CostActual.amount
    const actuals = await prisma.costActual.findMany({
      where: { projectId: p.id, organizationId, deletedAt: null },
      select: { amount: true },
    });
    const ac = actuals.reduce((s, a) => s + Number(a.amount), 0);

    // physicalProgress: média do schedule (se houver atividades)
    const acts = await prisma.scheduleActivity.findMany({
      where: { projectId: p.id, organizationId, deletedAt: null },
      select: { physicalProgress: true },
    });
    const physicalProgress =
      acts.length > 0
        ? Math.round((acts.reduce((s, a) => s + (a.physicalProgress ?? 0), 0) / acts.length) * 100) / 100
        : 0;

    const ev = Math.round(bac * (physicalProgress / 100) * 100) / 100;
    const pv = timePhasedPv(p.startDate, p.plannedEndDate, bac, asOf);

    const plannedPct = bac > 0 ? Math.round((pv / bac) * 10000) / 100 : 0;
    const actualPct = bac > 0 ? Math.round((ev / bac) * 10000) / 100 : 0;
    const spi = pv > 0 ? Math.round((ev / pv) * 100) / 100 : null;
    const cpi = ac > 0 ? Math.round((ev / ac) * 100) / 100 : null;

    const openRfis = await prisma.rfi.count({
      where: { projectId: p.id, organizationId, deletedAt: null, status: { notIn: ["CLOSED", "CANCELLED"] } },
    });
    const openPunchItems = await prisma.punchItem.count({
      where: { projectId: p.id, organizationId, deletedAt: null, status: { notIn: ["CLOSED", "VERIFIED"] } },
    });
    const delayed =
      !!p.plannedEndDate && p.plannedEndDate.getTime() < asOf.getTime() && p.status !== "COMPLETED" && p.status !== "CANCELLED" && p.status !== "ARCHIVED";

    const delayedActRows = await prisma.scheduleActivity.findMany({
      where: {
        projectId: p.id,
        organizationId,
        deletedAt: null,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
        plannedFinish: { lt: asOf },
      },
      select: { code: true, name: true, plannedFinish: true },
      orderBy: { plannedFinish: "asc" },
      take: 10,
    });
    const delayedActivities = delayedActRows.map((a) => `${a.code} — ${a.name}`);

    const riskRows = await prisma.risk.findMany({
      where: { projectId: p.id, organizationId, deletedAt: null, status: { notIn: ["CLOSED", "CANCELLED"] } },
      select: { code: true, title: true },
      orderBy: { code: "asc" },
      take: 10,
    });
    const riskCount = riskRows.length;
    const riskTitles = riskRows.map((r) => `${r.code} — ${r.title}`);

    rows.push({
      id: p.id,
      code: p.code,
      name: p.name,
      status: p.status,
      currentPhase: p.currentPhase,
      plannedStart: p.startDate ? p.startDate.toISOString().slice(0, 10) : null,
      plannedEnd: p.plannedEndDate ? p.plannedEndDate.toISOString().slice(0, 10) : null,
      physicalProgress,
      bac,
      pv,
      ev,
      ac,
      plannedPct,
      actualPct,
      spi,
      cpi,
      openRfis,
      openPunchItems,
      riskCount,
      riskTitles,
      delayed,
      delayedActivities,
    });

    totalOpenRfis += openRfis;
    totalOpenPunchItems += openPunchItems;
    totalRisks += riskCount;
    if (delayed) totalDelayed += 1;

    totalBac += bac;
    totalPv += pv;
    totalEv += ev;
    totalAc += ac;
  }

  const totalSpi = totalPv > 0 ? Math.round((totalEv / totalPv) * 100) / 100 : null;
  const totalCpi = totalAc > 0 ? Math.round((totalEv / totalAc) * 100) / 100 : null;

  return {
    asOf: asOfDate,
    kpis: {
      totalProjects: projects.length,
      delayedProjects: totalDelayed,
      totalBac: Math.round(totalBac * 100) / 100,
      totalPv: Math.round(totalPv * 100) / 100,
      totalEv: Math.round(totalEv * 100) / 100,
      totalAc: Math.round(totalAc * 100) / 100,
      spi: totalSpi,
      cpi: totalCpi,
      openRfis: totalOpenRfis,
      openPunchItems: totalOpenPunchItems,
      totalRisks,
    },
    projects: rows,
  };
}