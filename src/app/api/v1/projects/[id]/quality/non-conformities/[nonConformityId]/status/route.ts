import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { transitionNonConformity } from "@/modules/quality/nonconformities";
import { nonConformityTransitionSchema } from "@/modules/quality/schemas";
import { actorOf, idsFrom } from "@/modules/quality/http";

// Transição de status do NCR (E13-US03, §33): START/SUBMIT/VERIFY/REJECT/
// CANCEL/REOPEN. QUALITY:EDIT.
export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "EDIT");
    const { resourceId } = await idsFrom(context, "nonConformityId");

    const body = await request.json().catch(() => null);
    const parsed = nonConformityTransitionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Transição inválida.", {
        details: parsed.error.flatten(),
      });
    }

    const nonConformity = await transitionNonConformity({
      ...actorOf(tenant, request),
      nonConformityId: resourceId,
      ...parsed.data,
    });
    return Response.json({ nonConformity });
  },
});
