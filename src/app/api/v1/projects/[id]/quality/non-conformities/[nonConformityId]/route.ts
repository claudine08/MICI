import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getNonConformityRow } from "@/modules/quality/selectors";
import {
  updateNonConformity,
  deleteNonConformity,
} from "@/modules/quality/nonconformities";
import { updateNonConformitySchema } from "@/modules/quality/schemas";
import { actorOf, idsFrom } from "@/modules/quality/http";

// Não conformidade individual (E13-US03): GET detalhe (QUALITY:VIEW),
// PATCH edita conteúdo em OPEN/CORRECTION (QUALITY:EDIT), DELETE exclui
// logicamente em OPEN/CORRECTION (QUALITY:DELETE).
export const { GET, PATCH, DELETE } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "VIEW");
    const { resourceId } = await idsFrom(context, "nonConformityId");
    const nonConformity = await getNonConformityRow(tenant.organizationId, resourceId);
    return Response.json({ nonConformity });
  },

  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "EDIT");
    const { resourceId } = await idsFrom(context, "nonConformityId");

    const body = await request.json().catch(() => null);
    const parsed = updateNonConformitySchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Não conformidade inválida.", {
        details: parsed.error.flatten(),
      });
    }

    const nonConformity = await updateNonConformity({
      ...actorOf(tenant, request),
      nonConformityId: resourceId,
      ...parsed.data,
    });
    return Response.json({ nonConformity });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "DELETE");
    const { resourceId } = await idsFrom(context, "nonConformityId");
    const result = await deleteNonConformity({
      ...actorOf(tenant, request),
      nonConformityId: resourceId,
    });
    return Response.json(result);
  },
});
