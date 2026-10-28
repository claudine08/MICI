import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { transitionCorrectiveAction } from "@/modules/quality/corrective-actions";
import { correctiveActionTransitionSchema } from "@/modules/quality/schemas";
import { actorOf, idsFrom } from "@/modules/quality/http";

// Transição de status da ação corretiva (E13-US04): START/COMPLETE/VERIFY/
// REJECT/CLOSE/CANCEL/REOPEN. QUALITY:EDIT.
export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "EDIT");
    const { resourceId } = await idsFrom(context, "correctiveActionId");

    const body = await request.json().catch(() => null);
    const parsed = correctiveActionTransitionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Transição inválida.", {
        details: parsed.error.flatten(),
      });
    }

    const correctiveAction = await transitionCorrectiveAction({
      ...actorOf(tenant, request),
      correctiveActionId: resourceId,
      ...parsed.data,
    });
    return Response.json({ correctiveAction });
  },
});
