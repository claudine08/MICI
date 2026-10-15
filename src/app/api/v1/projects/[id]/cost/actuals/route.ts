import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { createActual } from "@/modules/cost/actuals";
import { listActuals } from "@/modules/cost/selectors";
import { createActualSchema } from "@/modules/cost/schemas";

async function projectIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do projeto ausente.");
  return id;
}

// Custos realizados (E08 §29): GET lista (COST:VIEW), POST cria (COST:CREATE).
export const { GET, POST } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COST", "VIEW");
    const projectId = await projectIdFrom(context);
    const actuals = await listActuals(tenant.organizationId, projectId);
    return Response.json({ actuals });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COST", "CREATE");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = createActualSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Custo realizado inválido.", {
        details: parsed.error.flatten(),
      });
    }

    const actual = await createActual({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      projectId,
      ...parsed.data,
    });
    return Response.json({ actual }, { status: 201 });
  },
});
