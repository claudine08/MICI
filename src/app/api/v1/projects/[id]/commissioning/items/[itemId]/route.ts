import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { updateCommissioningItem, deleteCommissioningItem } from "@/modules/commissioning/items";
import { updateCommissioningItemSchema } from "@/modules/commissioning/schemas";
import { actorOf, idsFrom } from "@/modules/commissioning/http";

export const { PATCH, DELETE } = apiHandler({
  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COMMISSIONING", "EDIT");
    const { resourceId: itemId } = await idsFrom(context, "itemId");
    const body = await request.json().catch(() => null);
    const parsed = updateCommissioningItemSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Item inválido.", { details: parsed.error.flatten() });
    }
    const item = await updateCommissioningItem({ ...actorOf(tenant, request), itemId, ...parsed.data });
    return Response.json({ item });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COMMISSIONING", "DELETE");
    const { resourceId: itemId } = await idsFrom(context, "itemId");
    const result = await deleteCommissioningItem({ ...actorOf(tenant, request), itemId });
    return Response.json(result);
  },
});