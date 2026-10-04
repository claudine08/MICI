import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { updateGateDefinition, deleteGateDefinition } from "@/modules/gates/definitions";
import { updateGateDefinitionSchema } from "@/modules/portfolio/schemas";

async function definitionIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do gate ausente.");
  return id;
}

// Definição de gate (E06-US01/US03):
// PATCH  → edita campos e/ou substitui critérios (GATE:EDIT)
// DELETE → soft-delete; gates do sistema são protegidos (GATE:DELETE)

export const { PATCH, DELETE } = apiHandler({
  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "GATE", "EDIT");
    const definitionId = await definitionIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = updateGateDefinitionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    await updateGateDefinition({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      definitionId,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      ...parsed.data,
    });

    return Response.json({ definition: { id: definitionId } });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "GATE", "DELETE");
    const definitionId = await definitionIdFrom(context);

    const result = await deleteGateDefinition({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      definitionId,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    });

    return Response.json({ definition: result });
  },
});
