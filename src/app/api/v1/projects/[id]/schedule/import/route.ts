import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { importSchedule } from "@/modules/schedule/importer";
import { loadTemplateSchedule } from "@/modules/schedule/templates";
import { parseScheduleFile } from "@/modules/schedule/msproject";
import { importScheduleSchema } from "@/modules/schedule/schemas";

async function projectIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do projeto ausente.");
  return id;
}

// Importação do cronograma MS Project (E07 import, §27):
// POST → CSV/XML (content) ou template salvo (templateId) — exatamente um.
// Substitui o cronograma existente do projeto (replace-all), valida o grafo
// contra ciclos antes de escrever e recalcula o CPM (SCHEDULE:EDIT).

export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SCHEDULE", "EDIT");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = importScheduleSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Payload de importação inválido.", {
        details: parsed.error.flatten(),
      });
    }

    const { filename, content, templateId, calendarId } = parsed.data;
    const schedule = templateId
      ? await loadTemplateSchedule(tenant.organizationId, templateId)
      : parseScheduleFile(filename ?? null, content ?? "");

    const summary = await importSchedule({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      projectId,
      schedule,
      calendarId: calendarId ?? null,
    });

    return Response.json({ import: summary });
  },
});
