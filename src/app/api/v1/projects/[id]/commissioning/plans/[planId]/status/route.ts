import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { transitionCommissioningPlan } from "@/modules/commissioning/plans";
import { commissioningPlanTransitionSchema } from "@/modules/commissioning/schemas";
import { actorOf, idsFrom } from "@/modules/commissioning/http";

export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COMMISSIONING", "EDIT");
    const { resourceId: planId } = await idsFrom(context, "planId");

    const body = await request.json().catch(() => null);
    const parsed = commissioningPlanTransitionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Transição inválida.", { details: parsed.error.flatten() });
    }

    const plan = await transitionCommissioningPlan({ ...actorOf(tenant, request), planId, ...parsed.data });
    return Response.json({ plan });
  },
});