import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import {
  listCostBaselines,
  createCostBaseline,
} from "@/modules/cost/baselines";
import { createBaselineSchema } from "@/modules/schedule/schemas";

async function projectIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do projeto ausente.");
  return id;
}

// Baseline de custo (E08 §29): GET lista (COST:VIEW), POST cria snapshot
// DRAFT do orçamento corrente (COST:CREATE). Aprovação em /baselines/[id]/status.
export const { GET, POST } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COST", "VIEW");
    const projectId = await projectIdFrom(context);
    const baselines = await listCostBaselines(tenant.organizationId, projectId);
    return Response.json({ baselines });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COST", "CREATE");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = createBaselineSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados da baseline inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const baseline = await createCostBaseline({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      projectId,
      reason: parsed.data.reason,
    });
    return Response.json({ baseline }, { status: 201 });
  },
});
