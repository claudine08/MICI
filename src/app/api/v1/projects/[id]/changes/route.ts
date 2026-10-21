import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listChanges } from "@/modules/change/selectors";
import { createChange } from "@/modules/change/changes";
import { createChangeSchema } from "@/modules/change/schemas";

async function projectIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do projeto ausente.");
  return id;
}

// Controle de mudanças do projeto (E11, §31):
// GET → lista as mudanças vivas com severidade consolidada (CHANGE:VIEW).
// POST → cria mudança em DRAFT (CHANGE:CREATE). Transições, impactos e
// aprovações ficam nas rotas irmãs /changes/[changeId]/{status,impacts,approvals}.
export const { GET, POST } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "CHANGE", "VIEW");
    const projectId = await projectIdFrom(context);
    const changes = await listChanges(tenant.organizationId, projectId);
    return Response.json({ changes });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "CHANGE", "CREATE");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = createChangeSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Mudança inválida.", {
        details: parsed.error.flatten(),
      });
    }

    const change = await createChange({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      projectId,
      ...parsed.data,
    });
    return Response.json({ change }, { status: 201 });
  },
});
