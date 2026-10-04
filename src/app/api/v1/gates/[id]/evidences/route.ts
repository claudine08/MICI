import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { addGateEvidence } from "@/modules/gates/instances";
import { addGateEvidenceSchema } from "@/modules/portfolio/schemas";

async function instanceIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do gate ausente.");
  return id;
}

// Evidências da instância (E06, BR-002):
// POST → registra evidência (GATE:EDIT)

export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "GATE", "EDIT");
    const instanceId = await instanceIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = addGateEvidenceSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados da evidência inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const result = await addGateEvidence({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      instanceId,
      label: parsed.data.label,
      url: parsed.data.url,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    });

    return Response.json(result, { status: 201 });
  },
});
