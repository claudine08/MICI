import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";

import { requireTenantContext, assertPermission } from "@/core/tenant";
import { confirmGoodsReceipt } from "@/modules/procurement/goods-receipts";
import { actorOf, idsFrom } from "@/modules/procurement/http";

export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "EDIT");
    const { projectId, resourceId: receiptId } = await idsFrom(context, "receiptId");
    const updated = await confirmGoodsReceipt(projectId, receiptId, actorOf(tenant, request));
    return Response.json({ receipt: updated });
  },
});