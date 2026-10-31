import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listGoodsReceipts } from "@/modules/procurement/selectors";
import { createGoodsReceipt } from "@/modules/procurement/goods-receipts";
import { createGoodsReceiptSchema } from "@/modules/procurement/schemas";
import { actorOf, projectIdFrom } from "@/modules/procurement/http";

export const { GET, POST } = apiHandler({
  GET: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "VIEW");
    const projectId = await projectIdFrom(context);
    const url = new URL(request.url);
    const receipts = await listGoodsReceipts(projectId, { purchaseOrderId: url.searchParams.get("purchaseOrderId") ?? undefined });
    return Response.json({ receipts });
  },
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "CREATE");
    const projectId = await projectIdFrom(context);
    const body = await request.json().catch(() => null);
    const parsed = createGoodsReceiptSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Dados do recebimento inválidos.", { details: parsed.error.flatten() });
    const receipt = await createGoodsReceipt(projectId, parsed.data, actorOf(tenant, request));
    return Response.json({ receipt }, { status: 201 });
  },
});