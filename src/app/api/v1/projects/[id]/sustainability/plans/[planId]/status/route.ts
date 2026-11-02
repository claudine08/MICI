import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { transitionSustainabilityPlan } from "@/modules/sustainability/plans";
import { sustainabilityPlanTransitionSchema } from "@/modules/sustainability/schemas";
import { actorOf, idsFrom } from "@/modules/sustainability/http";

export const { POST } = apiHandler({
  POST: async (request, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SUSTAINABILITY", "EDIT");
    const { resourceId: planId } = await idsFrom(context, "planId");
    const body = await request.json().catch(() => null);
    const parsed = sustainabilityPlanTransitionSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Transição inválida.", { details: parsed.error.flatten() });
    const plan = await transitionSustainabilityPlan({ ...actorOf(tenant, request), planId, ...parsed.data });
    return Response.json({ plan });
  },
});