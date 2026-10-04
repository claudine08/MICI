import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { setGateCriteria } from "@/modules/gates/instances";
import { setGateCriteriaSchema } from "@/modules/portfolio/schemas";

async function instanceIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do gate ausente.");
  return id;
}

// Critérios da instância (E06-US03, BR-002):
// PUT → { results: [{ criterionCode, completed, note? }] } (GATE:EDIT)

export const { PUT } = apiHandler({
  PUT: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "GATE", "EDIT");
    const instanceId = await instanceIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = setGateCriteriaSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados dos critérios inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const gate = await setGateCriteria({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      instanceId,
      results: parsed.data.results,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    });

    return Response.json({ gate });
  },
});
