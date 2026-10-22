import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getConstraintRow } from "@/modules/field/selectors";
import { updateConstraint, deleteConstraint } from "@/modules/field/constraints";
import { updateConstraintSchema } from "@/modules/field/schemas";
import { actorOf, idsFrom } from "@/modules/field/http";

// Restrição individual (E12-US05): GET detalhe, PATCH edita (bloqueado em
// REMOVED/CANCELLED), DELETE lógico (só OPEN).
export const { GET, PATCH, DELETE } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "VIEW");
    const { resourceId } = await idsFrom(context, "constraintId");
    const constraint = await getConstraintRow(tenant.organizationId, resourceId);
    return Response.json({ constraint });
  },

  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "EDIT");
    const { resourceId } = await idsFrom(context, "constraintId");

    const body = await request.json().catch(() => null);
    const parsed = updateConstraintSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Restrição inválida.", {
        details: parsed.error.flatten(),
      });
    }

    const constraint = await updateConstraint({
      ...actorOf(tenant, request),
      constraintId: resourceId,
      ...parsed.data,
    });
    return Response.json({ constraint });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "DELETE");
    const { resourceId } = await idsFrom(context, "constraintId");
    const result = await deleteConstraint({
      ...actorOf(tenant, request),
      constraintId: resourceId,
    });
    return Response.json(result);
  },
});
