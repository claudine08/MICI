import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { updateAcceptance, deleteAcceptance } from "@/modules/commissioning/acceptances";
import { updateAcceptanceSchema } from "@/modules/commissioning/schemas";
import { actorOf, idsFrom } from "@/modules/commissioning/http";

export const { PATCH, DELETE } = apiHandler({
  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COMMISSIONING", "EDIT");
    const { resourceId: acceptanceId } = await idsFrom(context, "acceptanceId");
    const body = await request.json().catch(() => null);
    const parsed = updateAcceptanceSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Aceite inválido.", { details: parsed.error.flatten() });
    }
    const acceptance = await updateAcceptance({ ...actorOf(tenant, request), acceptanceId, ...parsed.data });
    return Response.json({ acceptance });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COMMISSIONING", "DELETE");
    const { resourceId: acceptanceId } = await idsFrom(context, "acceptanceId");
    const result = await deleteAcceptance({ ...actorOf(tenant, request), acceptanceId });
    return Response.json(result);
  },
});