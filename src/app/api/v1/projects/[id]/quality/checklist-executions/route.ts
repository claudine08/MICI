import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listChecklistExecutions } from "@/modules/quality/selectors";
import { createChecklistExecution } from "@/modules/quality/executions";
import { createChecklistExecutionSchema } from "@/modules/quality/schemas";
import { actorOf, projectIdFrom } from "@/modules/quality/http";

// Execuções de checklist (E13-US01): GET lista (QUALITY:VIEW) com filtro
// ?inspectionId=, POST cria (QUALITY:CREATE) congelando o snapshot do modelo.
export const { GET, POST } = apiHandler({
  GET: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "VIEW");
    const projectId = await projectIdFrom(context);
    const url = new URL(request.url);
    const executions = await listChecklistExecutions(tenant.organizationId, projectId, {
      inspectionId: url.searchParams.get("inspectionId") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });
    return Response.json({ executions });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "CREATE");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = createChecklistExecutionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Execução de checklist inválida.", {
        details: parsed.error.flatten(),
      });
    }

    const execution = await createChecklistExecution({
      ...actorOf(tenant, request),
      projectId,
      ...parsed.data,
    });
    return Response.json({ execution }, { status: 201 });
  },
});
