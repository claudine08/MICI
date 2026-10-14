import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { updateCalendar, deleteCalendar } from "@/modules/schedule/calendars";
import { updateCalendarSchema } from "@/modules/schedule/schemas";

async function idsFrom(context: unknown): Promise<{ projectId: string; calendarId: string }> {
  const params = await (context as { params: Promise<{ id: string; calendarId: string }> }).params;
  if (!params.id || !params.calendarId) {
    throw new AppError("VALIDATION_ERROR", "Id do projeto ou do calendário ausente.");
  }
  return { projectId: params.id, calendarId: params.calendarId };
}

// Calendário (E07-US03): PATCH edita (SCHEDULE:EDIT), DELETE exclui (lógico,
// SCHEDULE:DELETE) — bloqueado enquanto houver atividades usando o calendário.

export const { PATCH, DELETE } = apiHandler({
  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SCHEDULE", "EDIT");
    const { calendarId } = await idsFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = updateCalendarSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados do calendário inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const calendar = await updateCalendar({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      calendarId,
      ...parsed.data,
    });

    return Response.json({ calendar });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SCHEDULE", "DELETE");
    const { calendarId } = await idsFrom(context);

    const result = await deleteCalendar({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      calendarId,
    });

    return Response.json(result);
  },
});
