import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { transitionPurchaseOrderSchema } from "@/modules/procurement/schemas";
import { transitionPurchaseOrderStatus } from "@/modules/procurement/purchase-orders";
import { actorOf, idsFrom } from "@/modules/procurement/http";

export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    const { projectId, resourceId: orderId } = await idsFrom(context, "orderId");
    const body = await request.json().catch(() => null);
    const parsed = transitionPurchaseOrderSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Dados da transição inválidos.", { details: parsed.error.flatten() });
    if (parsed.data.action === "CANCEL") assertPermission(tenant, "PROCUREMENT", "DELETE");
    else assertPermission(tenant, "PROCUREMENT", "EDIT");
    const updated = await transitionPurchaseOrderStatus(projectId, orderId, parsed.data, actorOf(tenant, request));
    return Response.json({ order: updated });
  },
});