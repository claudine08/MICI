import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { prisma } from "@/lib/prisma";

async function projectIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do projeto ausente.");
  return id;
}

// Rastreabilidade projeto: requisitos <-> atividades do cronograma via WBS.
// GET -> lista requisitos do projeto e as atividades que compartilham o mesmo wbsNodeId.

export const { GET } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROJECT", "VIEW");
    const projectId = await projectIdFrom(context);

    const [requirements, activities, wbsNodes] = await Promise.all([
      prisma.requirement.findMany({
        where: { organizationId: tenant.organizationId, projectId, deletedAt: null },
        select: { id: true, code: true, description: true, status: true, wbsNodeId: true },
        orderBy: { code: "asc" },
      }),
      prisma.scheduleActivity.findMany({
        where: { organizationId: tenant.organizationId, projectId, deletedAt: null },
        select: { id: true, code: true, name: true, wbsNodeId: true },
        orderBy: { code: "asc" },
      }),
      prisma.wBSNode.findMany({
        where: { organizationId: tenant.organizationId, projectId, deletedAt: null },
        select: { id: true, code: true, name: true },
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

    const rows = requirements.map((requirement) => ({
      requirement: {
        id: requirement.id,
        code: requirement.code,
        description: requirement.description,
        status: requirement.status,
      },
      wbs: requirement.wbsNodeId ? wbsById.get(requirement.wbsNodeId) ?? null : null,
      activities: requirement.wbsNodeId
        ? (activitiesByWbs.get(requirement.wbsNodeId) ?? []).map((activity) => ({
            id: activity.id,
            code: activity.code,
            name: activity.name,
          }))
        : [],
    }));

    return Response.json({ traceability: rows });
  },
});