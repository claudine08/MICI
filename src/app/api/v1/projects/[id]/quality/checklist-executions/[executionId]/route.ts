import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getChecklistExecutionRow } from "@/modules/quality/selectors";
import {
  updateChecklistExecution,
  deleteChecklistExecution,
} from "@/modules/quality/executions";
import { updateChecklistExecutionSchema } from "@/modules/quality/schemas";
import { actorOf, idsFrom } from "@/modules/quality/http";

// Execução individual (E13-US01): GET detalhe, PATCH responde itens (só em
// rascunho), DELETE lógico (bloqueado quando concluída).
export const { GET, PATCH, DELETE } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "VIEW");
    const { resourceId } = await idsFrom(context, "executionId");
    const execution = await getChecklistExecutionRow(tenant.organizationId, resourceId);
    return Response.json({ execution });
  },

  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "EDIT");
    const { resourceId } = await idsFrom(context, "executionId");

    const body = await request.json().catch(() => null);
    const parsed = updateChecklistExecutionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Execução de checklist inválida.", {
        details: parsed.error.flatten(),
      });
    }

    const execution = await updateChecklistExecution({
      ...actorOf(tenant, request),
      executionId: resourceId,
      ...parsed.data,
    });
    return Response.json({ execution });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "DELETE");
    const { resourceId } = await idsFrom(context, "executionId");
    const result = await deleteChecklistExecution({
      ...actorOf(tenant, request),
      executionId: resourceId,
    });
    return Response.json(result);
  },
});
