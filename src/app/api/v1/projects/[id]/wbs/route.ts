import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getWbsTree } from "@/modules/wbs/selectors";
import { createWbsNode } from "@/modules/wbs/wbs";
import { createWbsNodeSchema } from "@/modules/wbs/schemas";

async function projectIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do projeto ausente.");
  return id;
}

// Árvore de WBS (E05-US01, §74):
// GET  → árvore montada a partir da ordenação (WBS:VIEW);
// POST → novo nó (WBS:CREATE), código/ordem automáticos se omitidos.

export const { GET, POST } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "WBS", "VIEW");
    const projectId = await projectIdFrom(context);

    const tree = await getWbsTree(tenant.organizationId, projectId);
    return Response.json({ tree });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "WBS", "CREATE");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = createWbsNodeSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados do nó inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const node = await createWbsNode({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      projectId,
      ...parsed.data,
    });

    return Response.json({ node }, { status: 201 });
  },
});
