import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { transitionRisk } from "@/modules/risk/risks";
import { riskTransitionSchema } from "@/modules/risk/schemas";

// Transição do ciclo de vida do risco (E10, §32): ANALYZE/PLAN/IMPLEMENT/
// MONITOR/TREAT/CLOSE/CANCEL/REOPEN. PLAN grava o histórico de resposta;
// CLOSE exige o risco residual (E10-US04); CANCEL exige motivo.
export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "RISK", "EDIT");
    const { riskId } = await (context as {
      params: Promise<{ id: string; riskId: string }>;
    }).params;
    if (!riskId) throw new AppError("VALIDATION_ERROR", "Id do risco ausente.");

    const body = await request.json().catch(() => null);
    const parsed = riskTransitionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Transição inválida.", {
        details: parsed.error.flatten(),
      });
    }

    const risk = await transitionRisk({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      riskId,
      ...parsed.data,
    });
    return Response.json({ risk });
  },
});
