import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listBaselines, createBaseline } from "@/modules/schedule/baselines";
import { createBaselineSchema } from "@/modules/schedule/schemas";

async function projectIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do projeto ausente.");
  return id;
}

// Baselines (E07-US04, §28):
// GET  → lista (SCHEDULE:VIEW); POST → cria snapshot DRAFT (SCHEDULE:CREATE).

export const { GET, POST } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SCHEDULE", "VIEW");
    const projectId = await projectIdFrom(context);

    const baselines = await listBaselines(tenant.organizationId, projectId);
    return Response.json({ baselines });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SCHEDULE", "CREATE");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = createBaselineSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados da baseline inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const baseline = await createBaseline({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      projectId,
      ...parsed.data,
    });

    return Response.json({ baseline }, { status: 201 });
  },
});
