import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listSustainabilityMeasurements } from "@/modules/sustainability/selectors";
import { createSustainabilityMeasurement } from "@/modules/sustainability/measurements";
import { createSustainabilityMeasurementSchema } from "@/modules/sustainability/schemas";
import { actorOf, projectIdFrom } from "@/modules/sustainability/http";

export const { GET, POST } = apiHandler({
  GET: async (request, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SUSTAINABILITY", "VIEW");
    const projectId = await projectIdFrom(context);
    const measurements = await listSustainabilityMeasurements(tenant.organizationId, projectId);
    return Response.json({ measurements });
  },
  POST: async (request, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SUSTAINABILITY", "CREATE");
    const projectId = await projectIdFrom(context);
    const body = await request.json().catch(() => null);
    const parsed = createSustainabilityMeasurementSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Medição inválida.", { details: parsed.error.flatten() });
    const measurement = await createSustainabilityMeasurement({ ...actorOf(tenant, request), projectId, ...parsed.data });
    return Response.json({ measurement }, { status: 201 });
  },
});