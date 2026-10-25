import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listChecklistTemplates } from "@/modules/quality/selectors";
import { createChecklistTemplate } from "@/modules/quality/templates";
import { createChecklistTemplateSchema } from "@/modules/quality/schemas";
import { actorOf, projectIdFrom } from "@/modules/quality/http";

// Modelos de checklist (E13-US01, §33): GET lista (QUALITY:VIEW), POST cria
// (QUALITY:CREATE) — biblioteca de itens por projeto.
export const { GET, POST } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "VIEW");
    const projectId = await projectIdFrom(context);
    const templates = await listChecklistTemplates(tenant.organizationId, projectId);
    return Response.json({ templates });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "CREATE");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = createChecklistTemplateSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Modelo de checklist inválido.", {
        details: parsed.error.flatten(),
      });
    }

    const template = await createChecklistTemplate({
      ...actorOf(tenant, request),
      projectId,
      ...parsed.data,
    });
    return Response.json({ template }, { status: 201 });
  },
});
