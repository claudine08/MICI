import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listSustainabilityMetrics } from "@/modules/sustainability/selectors";
import { createSustainabilityMetric } from "@/modules/sustainability/metrics";
import { createSustainabilityMetricSchema } from "@/modules/sustainability/schemas";
import { actorOf, projectIdFrom } from "@/modules/sustainability/http";

export const { GET, POST } = apiHandler({
  GET: async (request, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SUSTAINABILITY", "VIEW");
    const projectId = await projectIdFrom(context);
    const metrics = await listSustainabilityMetrics(tenant.organizationId, projectId);
    return Response.json({ metrics });
  },
  POST: async (request, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SUSTAINABILITY", "CREATE");
    const projectId = await projectIdFrom(context);
    const body = await request.json().catch(() => null);
    const parsed = createSustainabilityMetricSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Métrica inválida.", { details: parsed.error.flatten() });
    const metric = await createSustainabilityMetric({ ...actorOf(tenant, request), projectId, ...parsed.data });
    return Response.json({ metric }, { status: 201 });
  },
});