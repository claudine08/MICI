import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { updateSustainabilityPlan, deleteSustainabilityPlan } from "@/modules/sustainability/plans";
import { updateSustainabilityPlanSchema } from "@/modules/sustainability/schemas";
import { actorOf, idsFrom } from "@/modules/sustainability/http";

export const { PATCH, DELETE } = apiHandler({
  PATCH: async (request, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SUSTAINABILITY", "EDIT");
    const { resourceId: planId } = await idsFrom(context, "planId");
    const body = await request.json().catch(() => null);
    const parsed = updateSustainabilityPlanSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Plano inválido.", { details: parsed.error.flatten() });
    const plan = await updateSustainabilityPlan({ ...actorOf(tenant, request), planId, ...parsed.data });
    return Response.json({ plan });
  },
  DELETE: async (request, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SUSTAINABILITY", "DELETE");
    const { resourceId: planId } = await idsFrom(context, "planId");
    const result = await deleteSustainabilityPlan({ ...actorOf(tenant, request), planId });
    return Response.json(result);
  },
});