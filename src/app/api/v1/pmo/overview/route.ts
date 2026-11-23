import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { prisma } from "@/lib/prisma";

export const { GET } = apiHandler({
  GET: async (_request: NextRequest) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PMO", "VIEW");

    const projects = await prisma.project.findMany({
      where: { organizationId: tenant.organizationId, deletedAt: null },
      select: { id: true, code: true, name: true, status: true },
      orderBy: { code: "asc" },
    });

    const rows = await Promise.all(
      projects.map(async (p) => {
        const [
          tasks, constraints, risks, changes,
          pr, qt, po, gr,
          inspections, ncs, punch,
          requirements, sustainabilityMeasurements,
          diaries, photos,
        ] = await Promise.all([
          prisma.fieldTask.count({ where: { projectId: p.id, organizationId: tenant.organizationId, deletedAt: null } }),
          prisma.constraint.count({ where: { projectId: p.id, organizationId: tenant.organizationId, deletedAt: null, status: { in: ["OPEN", "ADDRESSED"] } } }),
          prisma.risk.count({ where: { projectId: p.id, organizationId: tenant.organizationId, deletedAt: null, status: { notIn: ["CLOSED", "CANCELLED"] } } }),
          prisma.changeRequest.count({ where: { projectId: p.id, organizationId: tenant.organizationId, deletedAt: null, status: { notIn: ["CLOSED", "CANCELLED"] } } }),
          prisma.purchaseRequest.count({ where: { projectId: p.id, organizationId: tenant.organizationId, deletedAt: null } }),
          prisma.quotation.count({ where: { projectId: p.id, organizationId: tenant.organizationId, deletedAt: null } }),
          prisma.purchaseOrder.count({ where: { projectId: p.id, organizationId: tenant.organizationId, deletedAt: null } }),
          prisma.goodsReceipt.count({ where: { projectId: p.id, organizationId: tenant.organizationId, deletedAt: null } }),
          prisma.inspection.count({ where: { projectId: p.id, organizationId: tenant.organizationId, deletedAt: null } }),
          prisma.nonConformity.count({ where: { projectId: p.id, organizationId: tenant.organizationId, deletedAt: null, status: { notIn: ["CLOSED", "CANCELLED"] } } }),
          prisma.punchItem.count({ where: { projectId: p.id, organizationId: tenant.organizationId, deletedAt: null, status: { notIn: ["VERIFIED", "CLOSED"] } } }),
          prisma.requirement.count({ where: { projectId: p.id, organizationId: tenant.organizationId, deletedAt: null } }),
          prisma.sustainabilityMeasurement.count({ where: { projectId: p.id, organizationId: tenant.organizationId, deletedAt: null } }),
          prisma.fieldDiary.count({ where: { projectId: p.id, organizationId: tenant.organizationId, deletedAt: null } }),
          prisma.photoEvidence.count({ where: { projectId: p.id, organizationId: tenant.organizationId, deletedAt: null } }),
        ]);

        const overdueTasks = await prisma.fieldTask.count({ where: { projectId: p.id, organizationId: tenant.organizationId, deletedAt: null, status: { in: ["OPEN", "IN_PROGRESS", "BLOCKED"] }, dueDate: { lt: new Date() } } });

        const healthScore = tasks + constraints + risks + ncs + punch + overdueTasks;
        const health = healthScore === 0 ? "GREEN" : healthScore <= 5 ? "AMBER" : "RED";

        return {
          id: p.id,
          code: p.code,
          name: p.name,
          status: p.status,
          phase: p.status,
          health,
          metrics: {
            tasks, constraints, risks, changes,
            procurement: { requests: pr, quotations: qt, orders: po, receipts: gr },
            quality: { inspections, nonConformities: ncs, punchItems: punch },
            requirements,
            sustainability: { measurements: sustainabilityMeasurements },
            field: { diaries, photos },
            overdueTasks,
          },
        };
      })
    );

    const totals = rows.reduce(
      (acc, r) => {
        acc.tasks += r.metrics.tasks;
        acc.constraints += r.metrics.constraints;
        acc.risks += r.metrics.risks;
        acc.changes += r.metrics.changes;
        acc.ncs += r.metrics.quality.nonConformities;
        acc.punch += r.metrics.quality.punchItems;
        acc.requirements += r.metrics.requirements;
        return acc;
      },
      { tasks: 0, constraints: 0, risks: 0, changes: 0, ncs: 0, punch: 0, requirements: 0 }
    );

    return Response.json({ projects: rows, totals });
  },
});