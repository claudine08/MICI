import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { transitionInspection } from "@/modules/quality/inspections";
import { inspectionTransitionSchema } from "@/modules/quality/schemas";
import { actorOf, idsFrom } from "@/modules/quality/http";

// Transição da inspeção (E13-US02, §33): EXECUTE/PASS/FAIL/CLOSE/REOPEN/
// CANCEL por QUALITY:EDIT. PASS/FAIL exigem evidência (foto ou checklist
// concluído); FAIL exige `resultNotes` (não conformidade — NCR na Fatia 2);
// CANCEL exige `reason`.
export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "EDIT");
    const { resourceId } = await idsFrom(context, "inspectionId");

    const body = await request.json().catch(() => null);
    const parsed = inspectionTransitionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Transição inválida.", {
        details: parsed.error.flatten(),
      });
    }

    const inspection = await transitionInspection({
      ...actorOf(tenant, request),
      inspectionId: resourceId,
      ...parsed.data,
    });
    return Response.json({ inspection });
  },
});
