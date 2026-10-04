import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listGateDefinitions, createGateDefinition } from "@/modules/gates/definitions";
import { createGateDefinitionSchema } from "@/modules/portfolio/schemas";

// Definições de gate da organização (E06-US01/US03):
// GET  → lista com critérios (GATE:VIEW)
// POST → cria gate customizado com critérios (GATE:CREATE)

export const { GET, POST } = apiHandler({
  GET: async () => {
    const context = await requireTenantContext();
    assertPermission(context, "GATE", "VIEW");
    const definitions = await listGateDefinitions(context.organizationId);
    return Response.json({ definitions });
  },

  POST: async (request: NextRequest) => {
    const context = await requireTenantContext();
    assertPermission(context, "GATE", "CREATE");

    const body = await request.json().catch(() => null);
    const parsed = createGateDefinitionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados do gate inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const definitionId = await createGateDefinition({
      organizationId: context.organizationId,
      actorId: context.userId,
      actorLabel: context.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      ...parsed.data,
    });

    return Response.json({ definition: { id: definitionId } }, { status: 201 });
  },
});
