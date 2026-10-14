import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getRequirementDetail } from "@/modules/requirements/selectors";
import { updateRequirement, deleteRequirement } from "@/modules/requirements/requirements";
import { updateRequirementSchema } from "@/modules/requirements/schemas";

async function requirementIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do requisito ausente.");
  return id;
}

// Requisito específico (E04-US02 — versionamento a cada edição):
// GET    → detalhe + evidências (REQUIREMENT:VIEW);
// PATCH  → edição com nova RequirementRevision (REQUIREMENT:EDIT);
// DELETE → soft-delete (REQUIREMENT:DELETE).

export const { GET, PATCH, DELETE } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "REQUIREMENT", "VIEW");
    const requirementId = await requirementIdFrom(context);

    const requirement = await getRequirementDetail(tenant.organizationId, requirementId);
    return Response.json({ requirement });
  },

  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "REQUIREMENT", "EDIT");
    const requirementId = await requirementIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = updateRequirementSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados do requisito inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const requirement = await updateRequirement({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      requirementId,
      ...parsed.data,
    });

    return Response.json({ requirement });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "REQUIREMENT", "DELETE");
    const requirementId = await requirementIdFrom(context);

    const result = await deleteRequirement({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      requirementId,
    });

    return Response.json({ requirement: result });
  },
});
