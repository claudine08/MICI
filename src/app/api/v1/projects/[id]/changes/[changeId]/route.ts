import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getChangeRow, listChangeImpacts } from "@/modules/change/selectors";
import { updateChange, deleteChange } from "@/modules/change/changes";
import { updateChangeSchema } from "@/modules/change/schemas";

async function changeIdFrom(context: unknown): Promise<string> {
  const { changeId } = await (context as {
    params: Promise<{ id: string; changeId: string }>;
  }).params;
  if (!changeId) throw new AppError("VALIDATION_ERROR", "Id da mudança ausente.");
  return changeId;
}

// Mudança individual (E11, §31): GET detalhe + impactos avaliados
// (CHANGE:VIEW), PATCH edita (CHANGE:EDIT — só em DRAFT/IMPACT_ANALYSIS) e
// DELETE exclui logicamente (CHANGE:DELETE — no fluxo ativo é preciso cancelar
// antes; aprovada/implementada/encerrada é histórico e não some).
export const { GET, PATCH, DELETE } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "CHANGE", "VIEW");
    const changeId = await changeIdFrom(context);
    const [change, impacts] = await Promise.all([
      getChangeRow(tenant.organizationId, changeId),
      listChangeImpacts(tenant.organizationId, changeId),
    ]);
    return Response.json({ change, impacts });
  },

  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "CHANGE", "EDIT");
    const changeId = await changeIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = updateChangeSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const change = await updateChange({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      changeId,
      ...parsed.data,
    });
    return Response.json({ change });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "CHANGE", "DELETE");
    const changeId = await changeIdFrom(context);

    const result = await deleteChange({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      changeId,
    });
    return Response.json(result);
  },
});
