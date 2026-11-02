import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { transitionCommissioningItem } from "@/modules/commissioning/items";
import { commissioningItemTransitionSchema } from "@/modules/commissioning/schemas";
import { actorOf, idsFrom } from "@/modules/commissioning/http";

export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COMMISSIONING", "EDIT");
    const { resourceId: itemId } = await idsFrom(context, "itemId");

    const body = await request.json().catch(() => null);
    const parsed = commissioningItemTransitionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Transição inválida.", { details: parsed.error.flatten() });
    }

    const item = await transitionCommissioningItem({ ...actorOf(tenant, request), itemId, ...parsed.data });
    return Response.json({ item });
  },
});