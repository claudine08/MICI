import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getPunchItemRow } from "@/modules/quality/selectors";
import { updatePunchItem, deletePunchItem } from "@/modules/quality/punch-items";
import { updatePunchItemSchema } from "@/modules/quality/schemas";
import { actorOf, idsFrom } from "@/modules/quality/http";

// Item de punch list individual (E13-US05, §34): GET detalhe (QUALITY:VIEW),
// PATCH edita em OPEN/ASSIGNED/IN_PROGRESS (QUALITY:EDIT), DELETE nesses
// mesmos status (QUALITY:DELETE).
export const { GET, PATCH, DELETE } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "VIEW");
    const { resourceId } = await idsFrom(context, "punchItemId");
    const punchItem = await getPunchItemRow(tenant.organizationId, resourceId);
    return Response.json({ punchItem });
  },

  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "EDIT");
    const { resourceId } = await idsFrom(context, "punchItemId");

    const body = await request.json().catch(() => null);
    const parsed = updatePunchItemSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Item de punch list inválido.", {
        details: parsed.error.flatten(),
      });
    }

    const punchItem = await updatePunchItem({
      ...actorOf(tenant, request),
      punchItemId: resourceId,
      ...parsed.data,
    });
    return Response.json({ punchItem });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "DELETE");
    const { resourceId } = await idsFrom(context, "punchItemId");
    const result = await deletePunchItem({
      ...actorOf(tenant, request),
      punchItemId: resourceId,
    });
    return Response.json(result);
  },
});
