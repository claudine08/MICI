import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { reviewRequirement } from "@/modules/requirements/requirements";
import { reviewRequirementSchema } from "@/modules/requirements/schemas";

async function requirementIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do requisito ausente.");
  return id;
}

// Carimbo de revisão do DRP (§20 last_reviewed_at):
// POST → registra a data da última revisão (REQUIREMENT:EDIT).

export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "REQUIREMENT", "EDIT");
    const requirementId = await requirementIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = reviewRequirementSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados da revisão inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const result = await reviewRequirement({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      requirementId,
      note: parsed.data.note,
    });

    return Response.json(result);
  },
});
