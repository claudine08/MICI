import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { updateActual, deleteActual } from "@/modules/cost/actuals";
import { updateActualSchema } from "@/modules/cost/schemas";

async function actualIdFrom(context: unknown): Promise<string> {
  const { actualId } = await (context as { params: Promise<{ actualId: string }> }).params;
  if (!actualId) throw new AppError("VALIDATION_ERROR", "Id do realizado ausente.");
  return actualId;
}

// Custo realizado individual (E08 §29): PATCH edita (COST:EDIT),
// DELETE exclui logicamente (COST:DELETE).
export const { PATCH, DELETE } = apiHandler({
  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COST", "EDIT");
    const actualId = await actualIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = updateActualSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados inválidos.", { details: parsed.error.flatten() });
    }

    const actual = await updateActual({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      actualId,
      ...parsed.data,
    });
    return Response.json({ actual });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COST", "DELETE");
    const actualId = await actualIdFrom(context);

    const result = await deleteActual({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      actualId,
    });
    return Response.json(result);
  },
});
