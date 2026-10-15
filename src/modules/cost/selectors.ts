import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";

// Leituras de custo (E08, §29) — sempre escopadas pelo organization_id.

export async function assertCostProject(organizationId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: null },
    select: { id: true, code: true, name: true, startDate: true, currency: true },
  });
  if (!project) {
    throw new AppError("NOT_FOUND", "Projeto não encontrado nesta organização.");
  }
  return project;
}

function isoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function num(value: { toNumber(): number } | number | null): number {
  if (value === null) return 0;
  return typeof value === "number" ? value : value.toNumber();
}

export interface CostItemRow {
  id: string;
  code: string;
  description: string;
  category: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  origin: string | null;
  fontePreco: string | null;
  wbsNodeId: string | null;
  wbsNodeCode: string | null;
  wbsNodeName: string | null;
  commitmentTotal: number;
  actualTotal: number;
  version: number;
}

export interface CommitmentRow {
  id: string;
  code: string;
  description: string;
  supplier: string | null;
  amount: number;
  committedAt: string;
  status: "OPEN" | "CLOSED" | "CANCELLED";
  costItemId: string | null;
  costItemCode: string | null;
  version: number;
}

export interface ActualRow {
  id: string;
  code: string;
  description: string;
  amount: number;
  incurredAt: string;
  costItemId: string | null;
  costItemCode: string | null;
  commitmentId: string | null;
  commitmentCode: string | null;
  version: number;
}

export async function listCostItems(
  organizationId: string,
  projectId: string
): Promise<CostItemRow[]> {
  await assertCostProject(organizationId, projectId);
  const rows = await prisma.costItem.findMany({
    where: { organizationId, projectId, deletedAt: null },
    include: {
      wbsNode: { select: { code: true, name: true } },
      commitments: {
        where: { deletedAt: null, status: { not: "CANCELLED" } },
        select: { amount: true },
      },
      actuals: { where: { deletedAt: null }, select: { amount: true } },
    },
    orderBy: { code: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    description: row.description,
    category: row.category,
    unit: row.unit,
    quantity: num(row.quantity),
    unitPrice: num(row.unitPrice),
    amount: num(row.amount),
    origin: row.origin,
    fontePreco: row.fontePreco,
    wbsNodeId: row.wbsNodeId,
    wbsNodeCode: row.wbsNode?.code ?? null,
    wbsNodeName: row.wbsNode?.name ?? null,
    commitmentTotal: row.commitments.reduce((acc, c) => acc + num(c.amount), 0),
    actualTotal: row.actuals.reduce((acc, a) => acc + num(a.amount), 0),
    version: row.version,
  }));
}

export async function listCommitments(
  organizationId: string,
  projectId: string
): Promise<CommitmentRow[]> {
  await assertCostProject(organizationId, projectId);
  const rows = await prisma.costCommitment.findMany({
    where: { organizationId, projectId, deletedAt: null },
    include: { costItem: { select: { code: true } } },
    orderBy: { committedAt: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    description: row.description,
    supplier: row.supplier,
    amount: num(row.amount),
    committedAt: isoDate(row.committedAt)!,
    status: row.status,
    costItemId: row.costItemId,
    costItemCode: row.costItem?.code ?? null,
    version: row.version,
  }));
}

export async function listActuals(
  organizationId: string,
  projectId: string
): Promise<ActualRow[]> {
  await assertCostProject(organizationId, projectId);
  const rows = await prisma.costActual.findMany({
    where: { organizationId, projectId, deletedAt: null },
    include: {
      costItem: { select: { code: true } },
      commitment: { select: { code: true } },
    },
    orderBy: { incurredAt: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    description: row.description,
    amount: num(row.amount),
    incurredAt: isoDate(row.incurredAt)!,
    costItemId: row.costItemId,
    costItemCode: row.costItem?.code ?? null,
    commitmentId: row.commitmentId,
    commitmentCode: row.commitment?.code ?? null,
    version: row.version,
  }));
}

export interface CostSummaryRow {
  projectId: string;
  itemCount: number;
  totalBudget: number;
  commitmentTotal: number;
  actualTotal: number;
}

// Resumo de custo por projeto para a visão global /custos.
export async function listCostSummaries(
  organizationId: string
): Promise<CostSummaryRow[]> {
  const [items, commitments, actuals] = await Promise.all([
    prisma.costItem.groupBy({
      by: ["projectId"],
      where: { organizationId, deletedAt: null },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.costCommitment.groupBy({
      by: ["projectId"],
      where: { organizationId, deletedAt: null, status: { not: "CANCELLED" } },
      _sum: { amount: true },
    }),
    prisma.costActual.groupBy({
      by: ["projectId"],
      where: { organizationId, deletedAt: null },
      _sum: { amount: true },
    }),
  ]);

  const commitmentMap = new Map(
    commitments.map((row) => [row.projectId, num(row._sum.amount)])
  );
  const actualMap = new Map(actuals.map((row) => [row.projectId, num(row._sum.amount)]));

  return items.map((row) => ({
    projectId: row.projectId,
    itemCount: row._count._all,
    totalBudget: num(row._sum.amount),
    commitmentTotal: commitmentMap.get(row.projectId) ?? 0,
    actualTotal: actualMap.get(row.projectId) ?? 0,
  }));
}
