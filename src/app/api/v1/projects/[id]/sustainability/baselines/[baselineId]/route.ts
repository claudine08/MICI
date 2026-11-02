import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { updateSustainabilityBaseline, deleteSustainabilityBaseline } from "@/modules/sustainability/baselines";
import { updateSustainabilityBaselineSchema } from "@/modules/sustainability/schemas";
import { actorOf, idsFrom } from "@/modules/sustainability/http";

export const { PATCH, DELETE } = apiHandler({
  PATCH: async (request, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SUSTAINABILITY", "EDIT");
    const { resourceId: baselineId } = await idsFrom(context, "baselineId");
    const body = await request.json().catch(() => null);
    const parsed = updateSustainabilityBaselineSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Baseline inválido.", { details: parsed.error.flatten() });
    const baseline = await updateSustainabilityBaseline({ ...actorOf(tenant, request), baselineId, ...parsed.data });
    return Response.json({ baseline });
  },
  DELETE: async (request, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SUSTAINABILITY", "DELETE");
    const { resourceId: baselineId } = await idsFrom(context, "baselineId");
    const result = await deleteSustainabilityBaseline({ ...actorOf(tenant, request), baselineId });
    return Response.json(result);
  },
});