import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listChangeImpacts } from "@/modules/change/selectors";
import { upsertChangeImpact } from "@/modules/change/changes";
import { upsertChangeImpactSchema } from "@/modules/change/schemas";

// Avaliação de impacto por dimensão (E11, §31 ChangeImpact): GET lista as
// dimensões avaliadas; POST grava (upsert por dimensão) enquanto o pedido é
// editável (DRAFT) ou durante a análise formal (IMPACT_ANALYSIS).
export const { GET, POST } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "CHANGE", "VIEW");
    const { changeId } = await (context as {
      params: Promise<{ id: string; changeId: string }>;
    }).params;
    if (!changeId) throw new AppError("VALIDATION_ERROR", "Id da mudança ausente.");

    const impacts = await listChangeImpacts(tenant.organizationId, changeId);
    return Response.json({ impacts });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "CHANGE", "EDIT");
    const { changeId } = await (context as {
      params: Promise<{ id: string; changeId: string }>;
    }).params;
    if (!changeId) throw new AppError("VALIDATION_ERROR", "Id da mudança ausente.");

    const body = await request.json().catch(() => null);
    const parsed = upsertChangeImpactSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Avaliação de impacto inválida.", {
        details: parsed.error.flatten(),
      });
    }

    const impact = await upsertChangeImpact({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      changeId,
      ...parsed.data,
    });
    return Response.json({ impact });
  },
});
