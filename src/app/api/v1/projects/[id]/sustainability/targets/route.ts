
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listSustainabilityTargets } from "@/modules/sustainability/selectors";
import { createSustainabilityTarget } from "@/modules/sustainability/targets";
import { createSustainabilityTargetSchema } from "@/modules/sustainability/schemas";
import { actorOf, projectIdFrom } from "@/modules/sustainability/http";

export const { GET, POST } = apiHandler({
  GET: async (request, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SUSTAINABILITY", "VIEW");
    const projectId = await projectIdFrom(context);
    const targets = await listSustainabilityTargets(tenant.organizationId, projectId);
    return Response.json({ targets });
  },
  POST: async (request, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SUSTAINABILITY", "CREATE");
    const projectId = await projectIdFrom(context);
    const body = await request.json().catch(() => null);
    const parsed = createSustainabilityTargetSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Meta inválida.", { details: parsed.error.flatten() });
    const target = await createSustainabilityTarget({ ...actorOf(tenant, request), projectId, ...parsed.data });
    return Response.json({ target }, { status: 201 });
  },
});