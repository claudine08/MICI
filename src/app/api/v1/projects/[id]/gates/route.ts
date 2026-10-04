import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listProjectGateInstances } from "@/modules/gates/instances";

async function projectIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do projeto ausente.");
  return id;
}

// Gates do projeto (E06-US02):
// GET → instâncias de gate com snapshot de critérios (GATE:VIEW);
//       cria instâncias faltantes das definições ativas.

export const { GET } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "GATE", "VIEW");
    const projectId = await projectIdFrom(context);

    const gates = await listProjectGateInstances(
      tenant.organizationId,
      projectId,
      tenant.userId
    );

    return Response.json({ gates });
  },
});
