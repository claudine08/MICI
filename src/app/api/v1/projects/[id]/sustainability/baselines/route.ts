import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listSustainabilityBaselines } from "@/modules/sustainability/selectors";
import { createSustainabilityBaseline } from "@/modules/sustainability/baselines";
import { createSustainabilityBaselineSchema } from "@/modules/sustainability/schemas";
import { actorOf, projectIdFrom } from "@/modules/sustainability/http";

export const { GET, POST } = apiHandler({
  GET: async (request, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SUSTAINABILITY", "VIEW");
    const projectId = await projectIdFrom(context);
    const baselines = await listSustainabilityBaselines(tenant.organizationId, projectId);
    return Response.json({ baselines });
  },
  POST: async (request, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SUSTAINABILITY", "CREATE");
    const projectId = await projectIdFrom(context);
    const body = await request.json().catch(() => null);
    const parsed = createSustainabilityBaselineSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Baseline inválido.", { details: parsed.error.flatten() });
    const baseline = await createSustainabilityBaseline({ ...actorOf(tenant, request), projectId, ...parsed.data });
    return Response.json({ baseline }, { status: 201 });
  },
});