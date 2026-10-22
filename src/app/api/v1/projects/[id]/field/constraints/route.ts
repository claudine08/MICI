import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listConstraints } from "@/modules/field/selectors";
import { createConstraint } from "@/modules/field/constraints";
import { createConstraintSchema } from "@/modules/field/schemas";
import { actorOf, projectIdFrom } from "@/modules/field/http";

// Restrições de campo (E12-US05, §39): GET lista (FIELD:VIEW), POST cria
// (FIELD:CREATE) — Constraint Identification → Constraint Removal.
export const { GET, POST } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "VIEW");
    const projectId = await projectIdFrom(context);
    const constraints = await listConstraints(tenant.organizationId, projectId);
    return Response.json({ constraints });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "CREATE");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = createConstraintSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Restrição inválida.", {
        details: parsed.error.flatten(),
      });
    }

    const constraint = await createConstraint({
      ...actorOf(tenant, request),
      projectId,
      ...parsed.data,
    });
    return Response.json({ constraint }, { status: 201 });
  },
});
