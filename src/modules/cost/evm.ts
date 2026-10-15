import { prisma } from "@/lib/prisma";
import { computeEvm, type EvmResult } from "@/modules/cost/engine";
import { assertCostProject } from "@/modules/cost/selectors";

// Calcula o EVM do projeto (E08 §29) a partir do estado persistido: itens de
// custo, realizados e atividades vinculadas ao WBS. Puro de orquestração — o
// cálculo em si vive no engine (testável sem banco).

function isoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function num(value: { toNumber(): number } | number | null): number {
  if (value === null) return 0;
  return typeof value === "number" ? value : value.toNumber();
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function calculateProjectEvm(
  organizationId: string,
  projectId: string,
  dataDate?: string
): Promise<EvmResult> {
  const project = await assertCostProject(organizationId, projectId);

  const [items, actuals, activities] = await Promise.all([
    prisma.costItem.findMany({
      where: { organizationId, projectId, deletedAt: null },
      select: { code: true, amount: true, wbsNodeId: true },
    }),
    prisma.costActual.findMany({
      where: { organizationId, projectId, deletedAt: null },
      select: { amount: true },
    }),
    prisma.scheduleActivity.findMany({
      where: { organizationId, projectId, deletedAt: null },
      select: {
        wbsNodeId: true,
        duration: true,
        status: true,
        physicalProgress: true,
        plannedStart: true,
        plannedFinish: true,
      },
    }),
  ]);

  return computeEvm({
    items: items.map((item) => ({
      code: item.code,
      amount: num(item.amount),
      wbsNodeId: item.wbsNodeId,
    })),
    actuals: actuals.map((actual) => ({ amount: num(actual.amount) })),
    activities: activities.map((activity) => ({
      wbsNodeId: activity.wbsNodeId,
      duration: activity.duration,
      status: activity.status,
      physicalProgress: activity.physicalProgress,
      plannedStart: isoDate(activity.plannedStart),
      plannedFinish: isoDate(activity.plannedFinish),
    })),
    dataDate: dataDate ?? todayIso(),
    projectStartDate: isoDate(project.startDate),
  });
}
