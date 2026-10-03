import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listAuditEvents } from "@/core/audit";

// Trilha de auditoria (§54) — AUDIT:VIEW, sempre escopada ao tenant ativo.
// Filtros: objectType, objectId (histórico por objeto), action, page, pageSize.

export const { GET } = apiHandler({
  GET: async (request: NextRequest) => {
    const context = await requireTenantContext();
    assertPermission(context, "AUDIT", "VIEW");

    const params = request.nextUrl.searchParams;
    const result = await listAuditEvents({
      organizationId: context.organizationId,
      objectType: params.get("objectType") ?? undefined,
      objectId: params.get("objectId") ?? undefined,
      action: params.get("action") ?? undefined,
      page: Number(params.get("page") ?? "1") || 1,
      pageSize: Number(params.get("pageSize") ?? "50") || 50,
    });

    return Response.json(result);
  },
});
