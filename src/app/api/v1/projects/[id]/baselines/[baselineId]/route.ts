import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getBaseline, deleteBaseline } from "@/modules/schedule/baselines";

async function idsFrom(context: unknown): Promise<{ projectId: string; baselineId: string }> {
  const params = await (context as { params: Promise<{ id: string; baselineId: string }> }).params;
  if (!params.id || !params.baselineId) {
    throw new AppError("VALIDATION_ERROR", "Id do projeto ou da baseline ausente.");
  }
  return { projectId: params.id, baselineId: params.baselineId };
}

// Baseline (E07-US04, §28): GET → snapshot (SCHEDULE:VIEW);
// DELETE → remove apenas DRAFT/SUBMITTED (SCHEDULE:DELETE); APPROVED/SUPERSEDED
// respondem BASELINE_IMMUTABLE.

export const { GET, DELETE } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SCHEDULE", "VIEW");
    const { baselineId } = await idsFrom(context);

    const baseline = await getBaseline(tenant.organizationId, baselineId);
    return Response.json({ baseline });
  },

  DELETE: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SCHEDULE", "DELETE");
    const { baselineId } = await idsFrom(context);

    const result = await deleteBaseline({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: _request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: _request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      baselineId,
    });

    return Response.json(result);
  },
});
