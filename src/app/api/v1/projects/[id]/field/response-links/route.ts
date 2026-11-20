import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { createResponseLink } from "@/modules/field/response-links";

export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "CREATE");
    const { id } = await (context as { params: Promise<{ id: string }> }).params;
    const body = await request.json().catch(() => null);
    const entityType = body?.entityType;
    const entityId = body?.entityId;
    if (!entityType || !entityId) throw new AppError("VALIDATION_ERROR", "entityType e entityId são obrigatórios.");
    const token = await createResponseLink({
      organizationId: tenant.organizationId,
      projectId: id,
      entityType,
      entityId,
      createdBy: tenant.userId,
    });
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    return Response.json({ token, url: `${baseUrl}/campo-resposta/${token}` });
  },
});