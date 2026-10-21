import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { transitionChange } from "@/modules/change/changes";
import { changeTransitionSchema } from "@/modules/change/schemas";
import { isApprovalAction, isRejectionAction } from "@/modules/change/engine";

// Transição do workflow de mudança (E11, §31): SUBMIT/START_ANALYSIS/
// REQUEST_APPROVAL/IMPLEMENT/VERIFY/CLOSE/CANCEL usam CHANGE:EDIT; APPROVE
// exige CHANGE:APPROVE e REJECT exige CHANGE:REJECT (BR-004 — decisão de
// aprovação auditada em ChangeApproval).
export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    const { changeId } = await (context as {
      params: Promise<{ id: string; changeId: string }>;
    }).params;
    if (!changeId) throw new AppError("VALIDATION_ERROR", "Id da mudança ausente.");

    const body = await request.json().catch(() => null);
    const parsed = changeTransitionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Transição inválida.", {
        details: parsed.error.flatten(),
      });
    }

    if (isApprovalAction(parsed.data.action)) {
      assertPermission(tenant, "CHANGE", "APPROVE");
    } else if (isRejectionAction(parsed.data.action)) {
      assertPermission(tenant, "CHANGE", "REJECT");
    } else {
      assertPermission(tenant, "CHANGE", "EDIT");
    }

    const change = await transitionChange({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      changeId,
      ...parsed.data,
    });
    return Response.json({ change });
  },
});
