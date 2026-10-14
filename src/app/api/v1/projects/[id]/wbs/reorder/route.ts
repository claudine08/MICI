import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { reorderWbsNodes } from "@/modules/wbs/wbs";
import { reorderWbsSchema } from "@/modules/wbs/schemas";

async function projectIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do projeto ausente.");
  return id;
}

// Reordenação entre irmãos (E05-US02):
// POST → nova ordem explícita dos filhos de um pai (WBS:EDIT).

export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "WBS", "EDIT");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = reorderWbsSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados de ordenação inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const result = await reorderWbsNodes({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      projectId,
      parentId: parsed.data.parentId ?? null,
      orderedIds: parsed.data.orderedIds,
    });

    return Response.json(result);
  },
});
