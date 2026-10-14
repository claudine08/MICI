import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { applyCalendarToSchedule } from "@/modules/schedule/importer";
import { applyCalendarSchema } from "@/modules/schedule/schemas";

async function projectIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do projeto ausente.");
  return id;
}

// Aplicar calendário ao cronograma (E07 import, §27): vincula o calendário a
// todas as atividades, recalcula o CPM e persiste as datas do CPM no
// planejado das atividades não concluídas (SCHEDULE:EDIT).

export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SCHEDULE", "EDIT");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = applyCalendarSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados do calendário inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const summary = await applyCalendarToSchedule({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      projectId,
      calendarId: parsed.data.calendarId,
    });

    return Response.json({ calendarApply: summary });
  },
});
