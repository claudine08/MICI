import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listScheduleTemplates, createScheduleTemplate } from "@/modules/schedule/templates";
import { createScheduleTemplateSchema } from "@/modules/schedule/schemas";

// Templates de cronograma reutilizáveis (E07 import, §27):
// GET → lista (SCHEDULE:VIEW); POST → parseia o CSV/XML e salva o snapshot
// (SCHEDULE:CREATE). A aplicação acontece pelo diálogo de import do cronograma.

export const { GET, POST } = apiHandler({
  GET: async () => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SCHEDULE", "VIEW");

    const templates = await listScheduleTemplates(tenant.organizationId);
    return Response.json({ templates });
  },

  POST: async (request: NextRequest) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SCHEDULE", "CREATE");

    const body = await request.json().catch(() => null);
    const parsed = createScheduleTemplateSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados do template inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const template = await createScheduleTemplate({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      ...parsed.data,
    });

    return Response.json({ template }, { status: 201 });
  },
});
