
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listSustainabilityPlans } from "@/modules/sustainability/selectors";
import { createSustainabilityPlan } from "@/modules/sustainability/plans";
import { createSustainabilityPlanSchema } from "@/modules/sustainability/schemas";
import { actorOf, projectIdFrom } from "@/modules/sustainability/http";

export const { GET, POST } = apiHandler({
  GET: async (request, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SUSTAINABILITY", "VIEW");
    const projectId = await projectIdFrom(context);
    const plans = await listSustainabilityPlans(tenant.organizationId, projectId);
    return Response.json({ plans });
  },
  POST: async (request, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SUSTAINABILITY", "CREATE");
    const projectId = await projectIdFrom(context);
    const body = await request.json().catch(() => null);
    const parsed = createSustainabilityPlanSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Plano inválido.", { details: parsed.error.flatten() });
    const plan = await createSustainabilityPlan({ ...actorOf(tenant, request), projectId, ...parsed.data });
    return Response.json({ plan }, { status: 201 });
  },
});