import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getCorrectiveActionRow } from "@/modules/quality/selectors";
import {
  updateCorrectiveAction,
  deleteCorrectiveAction,
} from "@/modules/quality/corrective-actions";
import { updateCorrectiveActionSchema } from "@/modules/quality/schemas";
import { actorOf, idsFrom } from "@/modules/quality/http";

// Ação corretiva individual (E13-US04): GET detalhe (QUALITY:VIEW), PATCH
// edita em OPEN/IN_PROGRESS (QUALITY:EDIT), DELETE nesses mesmos status
// (QUALITY:DELETE).
export const { GET, PATCH, DELETE } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "VIEW");
    const { resourceId } = await idsFrom(context, "correctiveActionId");
    const correctiveAction = await getCorrectiveActionRow(tenant.organizationId, resourceId);
    return Response.json({ correctiveAction });
  },

  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "EDIT");
    const { resourceId } = await idsFrom(context, "correctiveActionId");

    const body = await request.json().catch(() => null);
    const parsed = updateCorrectiveActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Ação corretiva inválida.", {
        details: parsed.error.flatten(),
      });
    }

    const correctiveAction = await updateCorrectiveAction({
      ...actorOf(tenant, request),
      correctiveActionId: resourceId,
      ...parsed.data,
    });
    return Response.json({ correctiveAction });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "DELETE");
    const { resourceId } = await idsFrom(context, "correctiveActionId");
    const result = await deleteCorrectiveAction({
      ...actorOf(tenant, request),
      correctiveActionId: resourceId,
    });
    return Response.json(result);
  },
});
