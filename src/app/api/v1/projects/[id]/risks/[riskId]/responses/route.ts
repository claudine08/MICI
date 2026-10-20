import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listRiskResponses } from "@/modules/risk/selectors";
import { addRiskResponse } from "@/modules/risk/risks";
import { createRiskResponseSchema } from "@/modules/risk/schemas";

// Histórico de respostas do risco (E10-US03): GET lista o histórico
// imutável; POST registra um novo plano/revise (RISK:EDIT) e atualiza a
// resposta atual do risco.
export const { GET, POST } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "RISK", "VIEW");
    const { riskId } = await (context as {
      params: Promise<{ id: string; riskId: string }>;
    }).params;
    if (!riskId) throw new AppError("VALIDATION_ERROR", "Id do risco ausente.");

    const responses = await listRiskResponses(tenant.organizationId, riskId);
    return Response.json({ responses });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "RISK", "EDIT");
    const { riskId } = await (context as {
      params: Promise<{ id: string; riskId: string }>;
    }).params;
    if (!riskId) throw new AppError("VALIDATION_ERROR", "Id do risco ausente.");

    const body = await request.json().catch(() => null);
    const parsed = createRiskResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Resposta inválida.", {
        details: parsed.error.flatten(),
      });
    }

    const risk = await addRiskResponse({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      riskId,
      ...parsed.data,
    });
    return Response.json({ risk }, { status: 201 });
  },
});
