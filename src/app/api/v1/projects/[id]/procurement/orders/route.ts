import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listPurchaseOrders } from "@/modules/procurement/selectors";
import { createPurchaseOrder } from "@/modules/procurement/purchase-orders";
import { createPurchaseOrderSchema } from "@/modules/procurement/schemas";
import { actorOf, projectIdFrom } from "@/modules/procurement/http";

export const { GET, POST } = apiHandler({
  GET: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "VIEW");
    const projectId = await projectIdFrom(context);
    const url = new URL(request.url);
    const orders = await listPurchaseOrders(projectId, { status: url.searchParams.get("status") ?? undefined });
    return Response.json({ orders });
  },
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "CREATE");
    const projectId = await projectIdFrom(context);
    const body = await request.json().catch(() => null);
    const parsed = createPurchaseOrderSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Dados do pedido de compra inválidos.", { details: parsed.error.flatten() });
    const order = await createPurchaseOrder(projectId, parsed.data, actorOf(tenant, request));
    return Response.json({ order }, { status: 201 });
  },
});