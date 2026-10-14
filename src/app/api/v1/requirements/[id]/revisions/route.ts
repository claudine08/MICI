import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listRequirementRevisions } from "@/modules/requirements/selectors";

async function requirementIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do requisito ausente.");
  return id;
}

// Histórico de revisões (E04-US02): GET → snapshots na ordem decrescente.

export const { GET } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "REQUIREMENT", "VIEW");
    const requirementId = await requirementIdFrom(context);

    const revisions = await listRequirementRevisions(tenant.organizationId, requirementId);
    return Response.json({ revisions });
  },
});
