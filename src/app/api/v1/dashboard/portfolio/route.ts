import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getPortfolioDashboard } from "@/modules/dashboard/portfolio";

async function asOfFrom(request: NextRequest): Promise<string> {
  const url = new URL(request.url);
  const raw = url.searchParams.get("asOf");
  if (!raw) return new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new AppError("VALIDATION_ERROR", "Data de reporte inválida (use AAAA-MM-DD).");
  }
  return raw;
}

export const { GET } = apiHandler({
  GET: async (request: NextRequest) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROJECT", "VIEW");
    const asOf = await asOfFrom(request);
    const data = await getPortfolioDashboard(tenant.organizationId, asOf);
    return Response.json(data);
  },
});