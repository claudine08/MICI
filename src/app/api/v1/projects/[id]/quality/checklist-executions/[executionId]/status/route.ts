import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { transitionChecklistExecution } from "@/modules/quality/executions";
import { checklistExecutionTransitionSchema } from "@/modules/quality/schemas";
import { actorOf, idsFrom } from "@/modules/quality/http";

// Transição da execução (E13-US01, §33): COMPLETE/REOPEN/CANCEL por
// QUALITY:EDIT. COMPLETE exige todos os itens obrigatórios respondidos;
// CANCEL exige `reason`.
export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "EDIT");
    const { resourceId } = await idsFrom(context, "executionId");

    const body = await request.json().catch(() => null);
    const parsed = checklistExecutionTransitionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Transição inválida.", {
        details: parsed.error.flatten(),
      });
    }

    const execution = await transitionChecklistExecution({
      ...actorOf(tenant, request),
      executionId: resourceId,
      ...parsed.data,
    });
    return Response.json({ execution });
  },
});
