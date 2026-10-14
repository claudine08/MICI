import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listCalendars, createCalendar } from "@/modules/schedule/calendars";
import { createCalendarSchema } from "@/modules/schedule/schemas";

async function projectIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do projeto ausente.");
  return id;
}

// Calendários (E07-US03, §27): GET → projeto + organização (SCHEDULE:VIEW);
// POST → cria (SCHEDULE:CREATE); escopo PROJECT (padrão) ou ORGANIZATION.

export const { GET, POST } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SCHEDULE", "VIEW");
    const projectId = await projectIdFrom(context);

    const calendars = await listCalendars(tenant.organizationId, projectId);
    return Response.json({ calendars });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SCHEDULE", "CREATE");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = createCalendarSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados do calendário inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const calendar = await createCalendar({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      projectId,
      ...parsed.data,
    });

    return Response.json({ calendar }, { status: 201 });
  },
});
