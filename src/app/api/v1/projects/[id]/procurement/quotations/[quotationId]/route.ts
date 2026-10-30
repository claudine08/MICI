import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getQuotationById } from "@/modules/procurement/selectors";
import { deleteQuotation, updateQuotation } from "@/modules/procurement/quotations";
import { updateQuotationSchema } from "@/modules/procurement/schemas";
import { actorOf, idsFrom } from "@/modules/procurement/http";

export const { GET, PATCH, DELETE } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "VIEW");
    const { projectId, resourceId: quotationId } = await idsFrom(context, "quotationId");

    const quotation = await getQuotationById(projectId, quotationId);
    if (!quotation) throw new AppError("NOT_FOUND", "Cotação não encontrada.");
    return Response.json({ quotation });
  },

  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "EDIT");
    const { projectId, resourceId: quotationId } = await idsFrom(context, "quotationId");

    const body = await request.json().catch(() => null);
    const parsed = updateQuotationSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados da cotação inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const updated = await updateQuotation(projectId, quotationId, parsed.data, actorOf(tenant, request));
    return Response.json({ quotation: updated });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "DELETE");
    const { projectId, resourceId: quotationId } = await idsFrom(context, "quotationId");

    const result = await deleteQuotation(projectId, quotationId, actorOf(tenant, request));
    return Response.json(result);
  },
});

