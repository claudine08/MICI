import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { transitionConstraint } from "@/modules/field/constraints";
import { constraintTransitionSchema } from "@/modules/field/schemas";
import { actorOf, idsFrom } from "@/modules/field/http";

// Transição da restrição (E12-US05, §39): ADDRESS/REMOVE/CANCEL/REOPEN por
// FIELD:EDIT. REMOVE exige `resolution` (como foi resolvida).
export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "EDIT");
    const { resourceId } = await idsFrom(context, "constraintId");

    const body = await request.json().catch(() => null);
    const parsed = constraintTransitionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Transição inválida.", {
        details: parsed.error.flatten(),
      });
    }

    const constraint = await transitionConstraint({
      ...actorOf(tenant, request),
      constraintId: resourceId,
      ...parsed.data,
    });
    return Response.json({ constraint });
  },
});
