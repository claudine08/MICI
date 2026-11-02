import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { updateSustainabilityMetric, deleteSustainabilityMetric } from "@/modules/sustainability/metrics";
import { updateSustainabilityMetricSchema } from "@/modules/sustainability/schemas";
import { actorOf, idsFrom } from "@/modules/sustainability/http";

export const { PATCH, DELETE } = apiHandler({
  PATCH: async (request, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SUSTAINABILITY", "EDIT");
    const { resourceId: metricId } = await idsFrom(context, "metricId");
    const body = await request.json().catch(() => null);
    const parsed = updateSustainabilityMetricSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Métrica inválida.", { details: parsed.error.flatten() });
    const metric = await updateSustainabilityMetric({ ...actorOf(tenant, request), metricId, ...parsed.data });
    return Response.json({ metric });
  },
  DELETE: async (request, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SUSTAINABILITY", "DELETE");
    const { resourceId: metricId } = await idsFrom(context, "metricId");
    const result = await deleteSustainabilityMetric({ ...actorOf(tenant, request), metricId });
    return Response.json(result);
  },
});