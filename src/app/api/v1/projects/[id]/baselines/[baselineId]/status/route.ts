import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { transitionBaseline } from "@/modules/schedule/baselines";
import { baselineActionSchema } from "@/modules/schedule/schemas";

async function baselineIdFrom(context: unknown): Promise<string> {
  const params = await (context as { params: Promise<{ baselineId: string }> }).params;
  if (!params.baselineId) throw new AppError("VALIDATION_ERROR", "Id da baseline ausente.");
  return params.baselineId;
}

// Fluxo da baseline (E07-US04, §28): DRAFT → SUBMITTED → APPROVED
// (REJECT devolve SUBMITTED → DRAFT). SUBMIT/REJECT exigem SCHEDULE:EDIT;
// APPROVE exige SCHEDULE:APPROVE. APPROVED/SUPERSEDED → BASELINE_IMMUTABLE.

export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    const baselineId = await baselineIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = baselineActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Ação inválida.", { details: parsed.error.flatten() });
    }

    assertPermission(
      tenant,
      "SCHEDULE",
      parsed.data.action === "APPROVE" ? "APPROVE" : "EDIT"
    );

    const baseline = await transitionBaseline({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      baselineId,
      action: parsed.data.action,
    });

    return Response.json({ baseline });
  },
});
