import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { removeRequirementEvidence } from "@/modules/requirements/requirements";

async function idsFrom(context: unknown): Promise<{ id: string; evidenceId: string }> {
  const { id, evidenceId } = await (context as {
    params: Promise<{ id: string; evidenceId: string }>;
  }).params;
  if (!id || !evidenceId) {
    throw new AppError("VALIDATION_ERROR", "Id do requisito ou da evidência ausente.");
  }
  return { id, evidenceId };
}

// DELETE → remove evidência (REQUIREMENT:EDIT).

export const { DELETE } = apiHandler({
  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "REQUIREMENT", "EDIT");
    const { id, evidenceId } = await idsFrom(context);

    const result = await removeRequirementEvidence({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      requirementId: id,
      evidenceId,
    });

    return Response.json({ evidence: result });
  },
});
