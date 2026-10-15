import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import {
  transitionCostBaseline,
  deleteCostBaseline,
} from "@/modules/cost/baselines";
import { baselineActionSchema } from "@/modules/schedule/schemas";

async function baselineIdFrom(context: unknown): Promise<string> {
  const { baselineId } = await (context as { params: Promise<{ baselineId: string }> }).params;
  if (!baselineId) throw new AppError("VALIDATION_ERROR", "Id da baseline ausente.");
  return baselineId;
}

// Baseline de custo individual (E08 §29): POST muda status
// (SUBMIT/REJECT exigem COST:EDIT; APPROVE exige COST:APPROVE);
// DELETE remove só DRAFT/SUBMITTED (COST:DELETE).
export const { POST, DELETE } = apiHandler({
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
      "COST",
      parsed.data.action === "APPROVE" ? "APPROVE" : "EDIT"
    );

    const baseline = await transitionCostBaseline({
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

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COST", "DELETE");
    const baselineId = await baselineIdFrom(context);

    const result = await deleteCostBaseline({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      baselineId,
    });
    return Response.json(result);
  },
});
