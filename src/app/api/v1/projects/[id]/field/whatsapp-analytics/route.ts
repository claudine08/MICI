import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { prisma } from "@/lib/prisma";
import { projectIdFrom } from "@/modules/field/http";

export const { GET } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "VIEW");
    const projectId = await projectIdFrom(context);

    const [diaries, tasks, constraints, progress, photos] = await Promise.all([
      prisma.fieldDiary.count({ where: { organizationId: tenant.organizationId, projectId, source: "WHATSAPP", deletedAt: null } }),
      prisma.fieldTask.count({ where: { organizationId: tenant.organizationId, projectId, source: "WHATSAPP", deletedAt: null } }),
      prisma.constraint.count({ where: { organizationId: tenant.organizationId, projectId, source: "WHATSAPP", deletedAt: null } }),
      prisma.progressMeasurement.count({ where: { organizationId: tenant.organizationId, projectId, source: "WHATSAPP", deletedAt: null } }),
      prisma.photoEvidence.count({ where: { organizationId: tenant.organizationId, projectId, source: "WHATSAPP", deletedAt: null } }),
    ]);

    return Response.json({
      source: "WHATSAPP",
      counts: { diaries, tasks, constraints, progress, photos, total: diaries + tasks + constraints + progress + photos },
    });
  },
});