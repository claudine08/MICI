import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getRiskRow } from "@/modules/risk/selectors";
import { updateRisk, deleteRisk } from "@/modules/risk/risks";
import { updateRiskSchema } from "@/modules/risk/schemas";

async function riskIdFrom(context: unknown): Promise<string> {
  const { riskId } = await (context as {
    params: Promise<{ id: string; riskId: string }>;
  }).params;
  if (!riskId) throw new AppError("VALIDATION_ERROR", "Id do risco ausente.");
  return riskId;
}

// Risco individual (E10, §32): GET detalhe (RISK:VIEW), PATCH edita
// (RISK:EDIT — bloqueado em status terminal) e DELETE exclui logicamente
// (RISK:DELETE — encerrado é histórico e não some).
export const { GET, PATCH, DELETE } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "RISK", "VIEW");
    const riskId = await riskIdFrom(context);
    const risk = await getRiskRow(tenant.organizationId, riskId);
    return Response.json({ risk });
  },

  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "RISK", "EDIT");
    const riskId = await riskIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = updateRiskSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const risk = await updateRisk({
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

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "RISK", "DELETE");
    const riskId = await riskIdFrom(context);

    const result = await deleteRisk({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      riskId,
    });
    return Response.json(result);
  },
});
