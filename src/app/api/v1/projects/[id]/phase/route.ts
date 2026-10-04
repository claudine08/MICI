import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { changeProjectPhase } from "@/modules/gates/phase-gate";
import { changePhaseSchema } from "@/modules/portfolio/schemas";

async function projectIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do projeto ausente.");
  return id;
}

// Avanço/retorno de fase do projeto (BR-001, E06-US05):
// POST → { direction: "advance" | "retreat" } (PROJECT:EDIT)
// advance verifica gates obrigatórios da fase atual; bloqueio → 409
// PHASE_ADVANCE_BLOCKED com os gates pendentes.

export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROJECT", "EDIT");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = changePhaseSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const result = await changeProjectPhase({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      projectId,
      direction: parsed.data.direction,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    });

    return Response.json({ phase: result });
  },
});
