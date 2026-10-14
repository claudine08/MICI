import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { deleteDependency } from "@/modules/schedule/dependencies";

async function dependencyIdFrom(context: unknown): Promise<string> {
  const { dependencyId } = await (
    context as { params: Promise<{ dependencyId: string }> }
  ).params;
  if (!dependencyId) throw new AppError("VALIDATION_ERROR", "Id da dependência ausente.");
  return dependencyId;
}

// Remover dependência (E07-US02): DELETE /dependencies/[id] (SCHEDULE:DELETE).

export const { DELETE } = apiHandler({
  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SCHEDULE", "DELETE");
    const dependencyId = await dependencyIdFrom(context);

    const result = await deleteDependency({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      dependencyId,
    });

    return Response.json(result);
  },
});
