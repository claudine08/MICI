import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { importCashflowCsv } from "@/modules/cost/cashflow";

async function projectIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do projeto ausente.");
  return id;
}

export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COST", "CREATE");
    const projectId = await projectIdFrom(context);

    const formData = await request.formData();
    const file = formData.get("file");
    let csvText = "";
    if (file && typeof file !== "string") {
      csvText = await (file as Blob).text();
    } else {
      csvText = String(formData.get("csv") ?? "");
    }
    if (!csvText.trim()) {
      throw new AppError("VALIDATION_ERROR", "CSV vazio.");
    }

    const result = await importCashflowCsv(tenant.organizationId, projectId, {
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    }, csvText);
    return Response.json(result);
  },
});