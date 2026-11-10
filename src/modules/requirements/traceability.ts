import { prisma } from "@/lib/prisma";

// Rastreabilidade do projeto: requisitos <-> atividades do cronograma via WBS.
// Extraído da rota /api/v1/projects/[id]/traceability para permitir testes.

export interface TraceabilityActivity {
  id: string;
  code: string;
  name: string;
  status: string;
  physicalProgress: number;
}

export interface TraceabilityRow {
  requirement: {
    id: string;
    code: string;
    description: string;
    status: string;
    evidenceCount: number;
  };
  wbs: { id: string; code: string; name: string } | null;
  activities: TraceabilityActivity[];
}

export interface ProjectTraceability {
  traceability: TraceabilityRow[];
  unlinkedActivities: TraceabilityActivity[];
  summary: {
    totalRequirements: number;
    totalActivities: number;
    linkedRequirements: number;
    linkedActivities: number;
    unlinkedRequirements: number;
    unlinkedActivities: number;
  };
}

export async function getProjectTraceability(
  organizationId: string,
  projectId: string
): Promise<ProjectTraceability> {
  const [requirements, activities, wbsNodes, evidenceCounts] = await Promise.all([
    prisma.requirement.findMany({
      where: { organizationId, projectId, deletedAt: null },
      select: { id: true, code: true, description: true, status: true, wbsNodeId: true },
      orderBy: { code: "asc" },
    }),
    prisma.scheduleActivity.findMany({
      where: { organizationId, projectId, deletedAt: null },
      select: { id: true, code: true, name: true, status: true, physicalProgress: true, wbsNodeId: true },
      orderBy: { code: "asc" },
    }),
    prisma.wBSNode.findMany({
      where: { organizationId, projectId, deletedAt: null },
      select: { id: true, code: true, name: true },
    }),
    prisma.requirementEvidence.groupBy({
      by: ["requirementId"],
      where: { organizationId },
      _count: { _all: true },
    }),
  ]);

  const wbsById = new Map(wbsNodes.map((node) => [node.id, node]));
  const activitiesByWbs = new Map<string, typeof activities>();
  for (const activity of activities) {
    if (!activity.wbsNodeId) continue;
    const list = activitiesByWbs.get(activity.wbsNodeId) ?? [];
    list.push(activity);
    activitiesByWbs.set(activity.wbsNodeId, list);
  }

  const evidenceByRequirement = new Map(evidenceCounts.map((row) => [row.requirementId, row._count._all]));

  const rows: TraceabilityRow[] = requirements.map((requirement) => ({
    requirement: {
      id: requirement.id,
      code: requirement.code,
      description: requirement.description,
      status: requirement.status,
      evidenceCount: evidenceByRequirement.get(requirement.id) ?? 0,
    },
    wbs: requirement.wbsNodeId ? wbsById.get(requirement.wbsNodeId) ?? null : null,
    activities: requirement.wbsNodeId
      ? (activitiesByWbs.get(requirement.wbsNodeId) ?? []).map((activity) => ({
          id: activity.id,
          code: activity.code,
          name: activity.name,
          status: activity.status,
          physicalProgress: activity.physicalProgress,
        }))
      : [],
  }));

  const unlinkedActivities: TraceabilityActivity[] = activities
    .filter((activity) => !activity.wbsNodeId)
    .map((activity) => ({
      id: activity.id,
      code: activity.code,
      name: activity.name,
      status: activity.status,
      physicalProgress: activity.physicalProgress,
    }));

  const linkedRequirements = requirements.filter((r) => r.wbsNodeId).length;
  const linkedActivities = activities.filter((a) => a.wbsNodeId).length;

  return {
    traceability: rows,
    unlinkedActivities,
    summary: {
      totalRequirements: requirements.length,
      totalActivities: activities.length,
      linkedRequirements,
      linkedActivities,
      unlinkedRequirements: requirements.length - linkedRequirements,
      unlinkedActivities: unlinkedActivities.length,
    },
  };
}