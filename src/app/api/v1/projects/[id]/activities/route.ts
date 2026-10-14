import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listActivities } from "@/modules/schedule/selectors";
import { createActivity } from "@/modules/schedule/activities";
import { createActivitySchema } from "@/modules/schedule/schemas";

async function projectIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do projeto ausente.");
  return id;
}

// Atividades do cronograma (E07-US01, §27):
// GET  → lista (SCHEDULE:VIEW); POST → cria (SCHEDULE:CREATE), código automático.

export const { GET, POST } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SCHEDULE", "VIEW");
    const projectId = await projectIdFrom(context);

    const activities = await listActivities(tenant.organizationId, projectId);
    return Response.json({ activities });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SCHEDULE", "CREATE");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = createActivitySchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados da atividade inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const activity = await createActivity({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      projectId,
      ...parsed.data,
    });

    return Response.json({ activity }, { status: 201 });
  },
});
