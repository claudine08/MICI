import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { addRequirementEvidence } from "@/modules/requirements/requirements";
import { addRequirementEvidenceSchema } from "@/modules/requirements/schemas";

async function requirementIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do requisito ausente.");
  return id;
}

// Evidências do requisito (E04-US04, BR-008):
// POST → vincula evidência (REQUIREMENT:EDIT).

export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "REQUIREMENT", "EDIT");
    const requirementId = await requirementIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = addRequirementEvidenceSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados da evidência inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const result = await addRequirementEvidence({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      requirementId,
      label: parsed.data.label,
      url: parsed.data.url,
    });

    return Response.json(result, { status: 201 });
  },
});
