import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { updateActivityProgress } from "@/modules/schedule/activities";
import { progressSchema } from "@/modules/schedule/schemas";

async function activityIdFrom(context: unknown): Promise<string> {
  const { activityId } = await (
    context as { params: Promise<{ activityId: string }> }
  ).params;
  if (!activityId) throw new AppError("VALIDATION_ERROR", "Id da atividade ausente.");
  return activityId;
}

// Avanço físico (E07-US01): POST /activities/[id]/progress (SCHEDULE:EDIT).
// Concluir a atividade força physicalProgress = 100.

export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SCHEDULE", "EDIT");
    const activityId = await activityIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = progressSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Avanço inválido.", {
        details: parsed.error.flatten(),
      });
    }

    const activity = await updateActivityProgress({
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
});
