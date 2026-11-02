import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listCommissioningPlans } from "@/modules/commissioning/selectors";
import { createCommissioningPlan } from "@/modules/commissioning/plans";
import { createCommissioningPlanSchema } from "@/modules/commissioning/schemas";
import { actorOf, projectIdFrom } from "@/modules/commissioning/http";

export const { GET, POST } = apiHandler({
  GET: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COMMISSIONING", "VIEW");
    const projectId = await projectIdFrom(context);
    const plans = await listCommissioningPlans(tenant.organizationId, projectId);
    return Response.json({ plans });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COMMISSIONING", "CREATE");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = createCommissioningPlanSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Plano de comissionamento inválido.", { details: parsed.error.flatten() });
    }

    const plan = await createCommissioningPlan({ ...actorOf(tenant, request), projectId, ...parsed.data });
    return Response.json({ plan }, { status: 201 });
  },
});