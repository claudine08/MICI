import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { buildWbsTree, type WbsNodeLite, type WbsTreeNode } from "@/modules/wbs/engine";

// Leituras da WBS — sempre escopadas pelo organization_id do contexto.

export interface WbsNodeRow extends WbsTreeNode {
  requirementsCount: number;
  linkedActivityLabel: string | null;
  costTotal: number;
  riskTitles: string[];
  plannedStart: Date | null;
  plannedFinish: Date | null;
  actualStart: Date | null;
  actualFinish: Date | null;
}

export async function assertWbsProject(organizationId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: null },
    select: { id: true, code: true, name: true },
  });
  if (!project) {
    throw new AppError("NOT_FOUND", "Projeto não encontrado nesta organização.");
  }
  return project;
}

// Inclui nós apagados: o índice único (projectId, code) também os considera e o
// motor de importação precisa saber deles para ressuscitar registros.
export async function listAllWbsNodes(
  organizationId: string,
  projectId: string
): Promise<WbsNodeLite[]> {
  return prisma.wBSNode.findMany({
    where: { organizationId, projectId },
    select: {
      id: true,
      parentId: true,
      code: true,
      name: true,
      orderIndex: true,
      description: true,
      nodeType: true,
      deletedAt: true,
    },
    orderBy: { code: "asc" },
  });
}

export async function getWbsTree(
  organizationId: string,
  projectId: string
): Promise<WbsNodeRow[]> {
  await assertWbsProject(organizationId, projectId);
  const [nodes, activities, costItems, risks] = await Promise.all([
    prisma.wBSNode.findMany({
      where: { organizationId, projectId, deletedAt: null },
      select: {
        id: true,
        parentId: true,
        code: true,
        name: true,
        orderIndex: true,
        description: true,
        nodeType: true,
        deletedAt: true,
        _count: { select: { requirements: true } },
      },
      orderBy: { code: "asc" },
    }),
    prisma.scheduleActivity.findMany({
      where: { organizationId, projectId, deletedAt: null, wbsNodeId: { not: null } },
      select: { code: true, name: true, wbsNodeId: true, plannedStart: true, plannedFinish: true, actualStart: true, actualFinish: true },
      orderBy: { orderIndex: "asc" },
    }),
    prisma.costItem.findMany({
      where: { organizationId, projectId, deletedAt: null, wbsNodeId: { not: null } },
      select: { wbsNodeId: true, amount: true },
    }),
    prisma.risk.findMany({
      where: { organizationId, projectId, deletedAt: null, wbsNodeId: { not: null } },
      select: { wbsNodeId: true, code: true, title: true },
    }),
  ]);

  const activityByWbs = new Map<string, string[]>();
  const datesByWbs = new Map<string, { ps: Date | null; pf: Date | null; as: Date | null; af: Date | null }>();
  for (const a of activities) {
    if (!a.wbsNodeId) continue;
    const list = activityByWbs.get(a.wbsNodeId) ?? [];
    list.push(`${a.code} ${a.name}`.trim());
    activityByWbs.set(a.wbsNodeId, list);

    const cur = datesByWbs.get(a.wbsNodeId) ?? { ps: null, pf: null, as: null, af: null };
    if (a.plannedStart && (!cur.ps || a.plannedStart < cur.ps)) cur.ps = a.plannedStart;
    if (a.plannedFinish && (!cur.pf || a.plannedFinish > cur.pf)) cur.pf = a.plannedFinish;
    if (a.actualStart && (!cur.as || a.actualStart < cur.as)) cur.as = a.actualStart;
    if (a.actualFinish && (!cur.af || a.actualFinish > cur.af)) cur.af = a.actualFinish;
    datesByWbs.set(a.wbsNodeId, cur);
  }

  const costByWbs = new Map<string, number>();
  for (const c of costItems) {
    if (!c.wbsNodeId) continue;
    costByWbs.set(c.wbsNodeId, (costByWbs.get(c.wbsNodeId) ?? 0) + Number(c.amount));
  }

  const riskByWbs = new Map<string, string[]>();
  for (const r of risks) {
    if (!r.wbsNodeId) continue;
    const list = riskByWbs.get(r.wbsNodeId) ?? [];
    list.push(`${r.code} ${r.title}`.trim());
    riskByWbs.set(r.wbsNodeId, list);
  }

  const lite: (WbsNodeLite & {
    requirementsCount: number;
    linkedActivityLabel: string | null;
    costTotal: number;
    riskTitles: string[];
    plannedStart: Date | null;
    plannedFinish: Date | null;
    actualStart: Date | null;
    actualFinish: Date | null;
  })[] = nodes.map((node) => {
    const d = datesByWbs.get(node.id);
    return {
      id: node.id,
      parentId: node.parentId,
      code: node.code,
      name: node.name,
      orderIndex: node.orderIndex,
      description: node.description,
      nodeType: node.nodeType,
      deletedAt: node.deletedAt,
      requirementsCount: node._count.requirements,
      linkedActivityLabel: (activityByWbs.get(node.id) ?? []).join("; ") || null,
      costTotal: costByWbs.get(node.id) ?? 0,
      riskTitles: riskByWbs.get(node.id) ?? [],
      plannedStart: d?.ps ?? null,
      plannedFinish: d?.pf ?? null,
      actualStart: d?.as ?? null,
      actualFinish: d?.af ?? null,
    };
  });

  return buildWbsTree(lite) as WbsNodeRow[];
}

export interface WbsVersionRow {
  id: string;
  version: number;
  source: string;
  note: string | null;
  nodeCount: number;
  hasRawPayload: boolean;
  createdAt: Date;
  createdBy: string | null;
}

type WbsVersionRecord = {
  id: string;
  version: number;
  source: string;
  note: string | null;
  snapshot: unknown;
  rawPayload: unknown;
  createdAt: Date;
  createdBy: string | null;
};

export async function listWbsVersions(
  organizationId: string,
  projectId: string
): Promise<WbsVersionRow[]> {
  await assertWbsProject(organizationId, projectId);
  const versions = await prisma.wBSVersion.findMany({
    where: { organizationId, projectId },
    orderBy: { version: "desc" },
  });
  return (versions as unknown as WbsVersionRecord[]).map((version) => {
    const nodes = Array.isArray((version.snapshot as { nodes?: unknown[] })?.nodes)
      ? ((version.snapshot as { nodes: unknown[] }).nodes)
      : [];
    return {
      id: version.id,
      version: version.version,
      source: version.source,
      note: version.note,
      nodeCount: nodes.length,
      hasRawPayload: version.rawPayload !== null && version.rawPayload !== undefined,
      createdAt: version.createdAt,
      createdBy: version.createdBy,
    };
  });
}
