import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { updateSustainabilityMeasurement, deleteSustainabilityMeasurement } from "@/modules/sustainability/measurements";
import { updateSustainabilityMeasurementSchema } from "@/modules/sustainability/schemas";
import { actorOf, idsFrom } from "@/modules/sustainability/http";

export const { PATCH, DELETE } = apiHandler({
  PATCH: async (request, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SUSTAINABILITY", "EDIT");
    const { resourceId: measurementId } = await idsFrom(context, "measurementId");
    const body = await request.json().catch(() => null);
    const parsed = updateSustainabilityMeasurementSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Medição inválida.", { details: parsed.error.flatten() });
    const measurement = await updateSustainabilityMeasurement({ ...actorOf(tenant, request), measurementId, ...parsed.data });
    return Response.json({ measurement });
  },
  DELETE: async (request, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SUSTAINABILITY", "DELETE");
    const { resourceId: measurementId } = await idsFrom(context, "measurementId");
    const result = await deleteSustainabilityMeasurement({ ...actorOf(tenant, request), measurementId });
    return Response.json(result);
  },
});