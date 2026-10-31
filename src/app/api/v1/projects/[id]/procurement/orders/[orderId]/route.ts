import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getPurchaseOrderById } from "@/modules/procurement/selectors";
import { deletePurchaseOrder, updatePurchaseOrder } from "@/modules/procurement/purchase-orders";
import { updatePurchaseOrderSchema } from "@/modules/procurement/schemas";
import { actorOf, idsFrom } from "@/modules/procurement/http";

export const { GET, PATCH, DELETE } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "VIEW");
    const { projectId, resourceId: orderId } = await idsFrom(context, "orderId");
    const order = await getPurchaseOrderById(projectId, orderId);
    if (!order) throw new AppError("NOT_FOUND", "Pedido de compra não encontrado.");
    return Response.json({ order });
  },
  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "EDIT");
    const { projectId, resourceId: orderId } = await idsFrom(context, "orderId");
    const body = await request.json().catch(() => null);
    const parsed = updatePurchaseOrderSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Dados do pedido inválidos.", { details: parsed.error.flatten() });
    const updated = await updatePurchaseOrder(projectId, orderId, parsed.data, actorOf(tenant, request));
    return Response.json({ order: updated });
  },
  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "DELETE");
    const { projectId, resourceId: orderId } = await idsFrom(context, "orderId");
    const result = await deletePurchaseOrder(projectId, orderId, actorOf(tenant, request));
    return Response.json(result);
  },
});