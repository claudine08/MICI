import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { duplicateWbsNode } from "@/modules/wbs/wbs";

async function nodeIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do nó ausente.");
  return id;
}

// Duplicar nó e subárvore com códigos novos (§74): POST (WBS:CREATE).

export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "WBS", "CREATE");
    const nodeId = await nodeIdFrom(context);

    const result = await duplicateWbsNode({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      nodeId,
    });

    return Response.json(result, { status: 201 });
  },
});
