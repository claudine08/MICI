import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listAiRequests } from "@/modules/ai/selectors";

export const { GET } = apiHandler({
  GET: async (request: NextRequest) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "AI", "VIEW");
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");
    const rows = await listAiRequests(tenant.organizationId, projectId);
    return Response.json({ requests: rows });
  },
});