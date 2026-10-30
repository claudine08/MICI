import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getProcurementBoard } from "@/modules/procurement/selectors";
import { projectIdFrom } from "@/modules/procurement/http";

export const { GET } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "VIEW");
    const projectId = await projectIdFrom(context);
    const summary = await getProcurementBoard(tenant.organizationId, projectId);
    return Response.json({ summary });
  },
});

