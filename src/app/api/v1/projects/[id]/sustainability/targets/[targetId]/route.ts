import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { updateSustainabilityTarget, deleteSustainabilityTarget } from "@/modules/sustainability/targets";
import { updateSustainabilityTargetSchema } from "@/modules/sustainability/schemas";
import { actorOf, idsFrom } from "@/modules/sustainability/http";

export const { PATCH, DELETE } = apiHandler({
  PATCH: async (request, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SUSTAINABILITY", "EDIT");
    const { resourceId: targetId } = await idsFrom(context, "targetId");
    const body = await request.json().catch(() => null);
    const parsed = updateSustainabilityTargetSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Meta inválida.", { details: parsed.error.flatten() });
    const target = await updateSustainabilityTarget({ ...actorOf(tenant, request), targetId, ...parsed.data });
    return Response.json({ target });
  },
  DELETE: async (request, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SUSTAINABILITY", "DELETE");
    const { resourceId: targetId } = await idsFrom(context, "targetId");
    const result = await deleteSustainabilityTarget({ ...actorOf(tenant, request), targetId });
    return Response.json(result);
  },
});