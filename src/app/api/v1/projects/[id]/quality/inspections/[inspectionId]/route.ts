import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getInspectionRow } from "@/modules/quality/selectors";
import { updateInspection, deleteInspection } from "@/modules/quality/inspections";
import { updateInspectionSchema } from "@/modules/quality/schemas";
import { actorOf, idsFrom } from "@/modules/quality/http";

// Inspeção individual (E13-US02): GET detalhe, PATCH edita (só em
// PLANNED/EXECUTED), DELETE lógico (só PLANNED/CANCELLED — depois de
// executada o registro é histórico).
export const { GET, PATCH, DELETE } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "VIEW");
    const { resourceId } = await idsFrom(context, "inspectionId");
    const inspection = await getInspectionRow(tenant.organizationId, resourceId);
    return Response.json({ inspection });
  },

  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "EDIT");
    const { resourceId } = await idsFrom(context, "inspectionId");

    const body = await request.json().catch(() => null);
    const parsed = updateInspectionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Inspeção inválida.", {
        details: parsed.error.flatten(),
      });
    }

    const inspection = await updateInspection({
      ...actorOf(tenant, request),
      inspectionId: resourceId,
      ...parsed.data,
    });
    return Response.json({ inspection });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "DELETE");
    const { resourceId } = await idsFrom(context, "inspectionId");
    const result = await deleteInspection({
      ...actorOf(tenant, request),
      inspectionId: resourceId,
    });
    return Response.json(result);
  },
});
