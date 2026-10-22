import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getProgressRow } from "@/modules/field/selectors";
import { updateProgress, deleteProgress } from "@/modules/field/progress";
import { updateProgressSchema } from "@/modules/field/schemas";
import { actorOf, idsFrom } from "@/modules/field/http";

// Medição individual (E12-US04): GET detalhe, PATCH edita (reaplica o
// avanço físico da atividade vinculada), DELETE exclusão lógica (o
// physicalProgress não retroage — a próxima medição corrige).
export const { GET, PATCH, DELETE } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "VIEW");
    const { resourceId } = await idsFrom(context, "progressId");
    const measurement = await getProgressRow(tenant.organizationId, resourceId);
    return Response.json({ measurement });
  },

  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "EDIT");
    const { resourceId } = await idsFrom(context, "progressId");

    const body = await request.json().catch(() => null);
    const parsed = updateProgressSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Medição inválida.", {
        details: parsed.error.flatten(),
      });
    }

    const measurement = await updateProgress({
      ...actorOf(tenant, request),
      progressId: resourceId,
      ...parsed.data,
    });
    return Response.json({ measurement });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "DELETE");
    const { resourceId } = await idsFrom(context, "progressId");
    const result = await deleteProgress({ ...actorOf(tenant, request), progressId: resourceId });
    return Response.json(result);
  },
});
