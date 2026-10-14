import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { recalculateSchedule } from "@/modules/schedule/cpm";

async function projectIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do projeto ausente.");
  return id;
}

// Caminho crítico (E07-US06, §27): GET /schedule/cpm recalcula forward/backward
// pass e PERSISTE total_float/critical — nunca confia no valor armazenado.

export const { GET } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SCHEDULE", "VIEW");
    const projectId = await projectIdFrom(context);

    const cpm = await recalculateSchedule(tenant.organizationId, projectId);
    return Response.json({ cpm });
  },
});
