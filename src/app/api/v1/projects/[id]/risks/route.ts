import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listRisks } from "@/modules/risk/selectors";
import { createRisk } from "@/modules/risk/risks";
import { createRiskSchema } from "@/modules/risk/schemas";

async function projectIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do projeto ausente.");
  return id;
}

// Registro de riscos do projeto (E10-US01, §32):
// GET → lista os riscos vivos com nível derivado da matriz (RISK:VIEW).
// POST → cria risco (RISK:CREATE). Transições, respostas e exclusão ficam
// nas rotas irmãs /risks/[riskId]/{status,responses}.
export const { GET, POST } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "RISK", "VIEW");
    const projectId = await projectIdFrom(context);
    const risks = await listRisks(tenant.organizationId, projectId);
    return Response.json({ risks });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "RISK", "CREATE");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = createRiskSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Risco inválido.", {
        details: parsed.error.flatten(),
      });
    }

    const risk = await createRisk({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      projectId,
      ...parsed.data,
    });
    return Response.json({ risk }, { status: 201 });
  },
});
