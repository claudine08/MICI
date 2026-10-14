import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { deleteScheduleTemplate } from "@/modules/schedule/templates";

async function templateIdFrom(context: unknown): Promise<string> {
  const { templateId } = await (context as { params: Promise<{ templateId: string }> }).params;
  if (!templateId) throw new AppError("VALIDATION_ERROR", "Id do template ausente.");
  return templateId;
}

// Template de cronograma (E07 import, §27): exclusão lógica (SCHEDULE:DELETE).

export const { DELETE } = apiHandler({
  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SCHEDULE", "DELETE");

    const result = await deleteScheduleTemplate({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      templateId: await templateIdFrom(context),
    });

    return Response.json({ template: result });
  },
});
