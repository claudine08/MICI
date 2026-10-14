import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { importWbsTree } from "@/modules/wbs/wbs";
import { importWbsSchema } from "@/modules/wbs/schemas";

async function projectIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do projeto ausente.");
  return id;
}

// Importação da árvore (E05-US03, §0.1 regra 18):
// POST → valida, reporta erros linha a linha e faz merge (WBS:EDIT).
// Erros de validação voltam em details.errors; o payload original é preservado
// no WBSVersion.rawPayload junto com o snapshot anterior.

export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "WBS", "EDIT");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = importWbsSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Payload de importação inválido.", {
        details: parsed.error.flatten(),
      });
    }

    const summary = await importWbsTree({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      projectId,
      nodes: parsed.data.nodes,
      note: parsed.data.note,
    });

    return Response.json({ import: summary });
  },
});
