import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { deleteActivity, updateActivity } from "@/modules/schedule/activities";
import { updateActivitySchema } from "@/modules/schedule/schemas";

async function idsFrom(context: unknown): Promise<{ projectId: string; activityId: string }> {
  const { id, activityId } = await (
    context as { params: Promise<{ id: string; activityId: string }> }
  ).params;
  if (!id || !activityId) {
    throw new AppError("VALIDATION_ERROR", "Id do projeto ou da atividade ausente.");
  }
  return { projectId: id, activityId };
}

// Atividade isolada (E07-US01): PATCH edita (SCHEDULE:EDIT),
// DELETE faz exclusão lógica bloqueada por dependências (SCHEDULE:DELETE).

export const { PATCH, DELETE } = apiHandler({
  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SCHEDULE", "EDIT");
    const { activityId } = await idsFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = updateActivitySchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados da atividade inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const activity = await updateActivity({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      activityId,
      ...parsed.data,
    });

    return Response.json({ activity });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SCHEDULE", "DELETE");
    const { activityId } = await idsFrom(context);

    const result = await deleteActivity({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      activityId,
    });

    return Response.json(result);
  },
});
