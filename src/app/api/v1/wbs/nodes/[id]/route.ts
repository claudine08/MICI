import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { updateWbsNode, deleteWbsNode } from "@/modules/wbs/wbs";
import { updateWbsNodeSchema } from "@/modules/wbs/schemas";

async function nodeIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do nó ausente.");
  return id;
}

// Nó de WBS específico (E05-US01/US02, §74):
// PATCH  → edição/movimento com checagem de ciclo e profundidade (WBS:EDIT);
// DELETE → soft-delete bloqueado se houver filhos ou requisitos (WBS:DELETE).

export const { PATCH, DELETE } = apiHandler({
  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "WBS", "EDIT");
    const nodeId = await nodeIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = updateWbsNodeSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados do nó inválidos.", {
        details: parsed.error.flatten(),
      });
    }
    if (Object.keys(parsed.data).length === 0) {
      throw new AppError("VALIDATION_ERROR", "Nenhum campo para atualizar.");
    }

    const node = await updateWbsNode({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      nodeId,
      ...parsed.data,
    });

    return Response.json({ node });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "WBS", "DELETE");
    const nodeId = await nodeIdFrom(context);

    const result = await deleteWbsNode({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      nodeId,
    });

    return Response.json({ node: result });
  },
});
