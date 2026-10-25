import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getChecklistTemplateRow } from "@/modules/quality/selectors";
import { updateChecklistTemplate, deleteChecklistTemplate } from "@/modules/quality/templates";
import { updateChecklistTemplateSchema } from "@/modules/quality/schemas";
import { actorOf, idsFrom } from "@/modules/quality/http";

// Modelo individual (E13-US01): GET detalhe, PATCH edita, DELETE lógico —
// bloqueado quando o modelo já possui execuções vinculadas.
export const { GET, PATCH, DELETE } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "VIEW");
    const { resourceId } = await idsFrom(context, "templateId");
    const template = await getChecklistTemplateRow(tenant.organizationId, resourceId);
    return Response.json({ template });
  },

  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "EDIT");
    const { resourceId } = await idsFrom(context, "templateId");

    const body = await request.json().catch(() => null);
    const parsed = updateChecklistTemplateSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Modelo de checklist inválido.", {
        details: parsed.error.flatten(),
      });
    }

    const template = await updateChecklistTemplate({
      ...actorOf(tenant, request),
      templateId: resourceId,
      ...parsed.data,
    });
    return Response.json({ template });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "DELETE");
    const { resourceId } = await idsFrom(context, "templateId");
    const result = await deleteChecklistTemplate({
      ...actorOf(tenant, request),
      templateId: resourceId,
    });
    return Response.json(result);
  },
});
