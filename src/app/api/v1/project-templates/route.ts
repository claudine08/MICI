import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listTemplates } from "@/modules/portfolio/selectors";
import { createTemplate } from "@/modules/portfolio/templates";
import { createTemplateSchema } from "@/modules/portfolio/schemas";

// Templates de projeto (E03-US04):
// GET  → lista templates (PROJECT:VIEW)
// POST → cria template (PROJECT:CREATE)

export const { GET, POST } = apiHandler({
  GET: async () => {
    const context = await requireTenantContext();
    assertPermission(context, "PROJECT", "VIEW");
    const templates = await listTemplates(context.organizationId);
    return Response.json({ templates });
  },

  POST: async (request: NextRequest) => {
    const context = await requireTenantContext();
    assertPermission(context, "PROJECT", "CREATE");

    const body = await request.json().catch(() => null);
    const parsed = createTemplateSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados do template inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const template = await createTemplate({
      organizationId: context.organizationId,
      actorId: context.userId,
      actorLabel: context.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      ...parsed.data,
    });

    return Response.json({ template }, { status: 201 });
  },
});
