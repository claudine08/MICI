import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getGoodsReceiptById } from "@/modules/procurement/selectors";
import { deleteGoodsReceipt } from "@/modules/procurement/goods-receipts";
import { actorOf, idsFrom } from "@/modules/procurement/http";

export const { GET, DELETE } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "VIEW");
    const { projectId, resourceId: receiptId } = await idsFrom(context, "receiptId");
    const receipt = await getGoodsReceiptById(projectId, receiptId);
    if (!receipt) throw new AppError("NOT_FOUND", "Recebimento não encontrado.");
    return Response.json({ receipt });
  },
  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "DELETE");
    const { projectId, resourceId: receiptId } = await idsFrom(context, "receiptId");
    const result = await deleteGoodsReceipt(projectId, receiptId, actorOf(tenant, request));
    return Response.json(result);
  },
});