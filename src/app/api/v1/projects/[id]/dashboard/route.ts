import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getProjectDashboard } from "@/modules/dashboard/project";

async function projectIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do projeto ausente.");
  return id;
}

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
  GET: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROJECT", "VIEW");
    const projectId = await projectIdFrom(context);
    const asOf = await asOfFrom(request);
    const data = await getProjectDashboard(tenant.organizationId, projectId, asOf);
    return Response.json(data);
  },
});