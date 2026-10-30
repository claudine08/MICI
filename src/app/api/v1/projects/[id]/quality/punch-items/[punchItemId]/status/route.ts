import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { transitionPunchItem } from "@/modules/quality/punch-items";
import { punchItemTransitionSchema } from "@/modules/quality/schemas";
import { actorOf, idsFrom } from "@/modules/quality/http";

// Transição de status do item de punch list (E13-US05, §34): ASSIGN/START/
// SUBMIT/VERIFY/REJECT/CLOSE/REOPEN. QUALITY:EDIT.
export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "EDIT");
    const { resourceId } = await idsFrom(context, "punchItemId");

    const body = await request.json().catch(() => null);
    const parsed = punchItemTransitionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Transição inválida.", {
        details: parsed.error.flatten(),
      });
    }

    const punchItem = await transitionPunchItem({
      ...actorOf(tenant, request),
      punchItemId: resourceId,
      ...parsed.data,
    });
    return Response.json({ punchItem });
  },
});
