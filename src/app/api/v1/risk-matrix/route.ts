import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getRiskMatrixView, upsertRiskMatrixConfig } from "@/modules/risk/matrix";
import { riskMatrixConfigSchema } from "@/modules/risk/schemas";

// Matriz de risco configurável da organização (E10-US02, §32):
// GET devolve a matriz efetiva (default ou custom); PUT grava a custom
// (RISK:ADMIN). Os níveis de todos os riscos da org passam a usá-la.
export const { GET, PUT } = apiHandler({
  GET: async () => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "RISK", "VIEW");
    const matrix = await getRiskMatrixView(tenant.organizationId);
    return Response.json({ matrix });
  },

  PUT: async (request: NextRequest) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "RISK", "ADMIN");

    const body = await request.json().catch(() => null);
    const parsed = riskMatrixConfigSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Matriz de risco inválida.", {
        details: parsed.error.flatten(),
      });
    }

    const config = await upsertRiskMatrixConfig({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      ...parsed.data,
    });
    return Response.json({ matrix: await getRiskMatrixView(tenant.organizationId), config });
  },
});
