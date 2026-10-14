import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { buildWbsTree, type WbsNodeLite, type WbsTreeNode } from "@/modules/wbs/engine";

// Leituras da WBS — sempre escopadas pelo organization_id do contexto.

export interface WbsNodeRow extends WbsTreeNode {
  requirementsCount: number;
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
  const nodes = await prisma.wBSNode.findMany({
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
  });

  const lite: (WbsNodeLite & { requirementsCount: number })[] = nodes.map((node) => ({
    id: node.id,
    parentId: node.parentId,
    code: node.code,
    name: node.name,
    orderIndex: node.orderIndex,
    description: node.description,
    nodeType: node.nodeType,
    deletedAt: node.deletedAt,
    requirementsCount: node._count.requirements,
  }));

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
