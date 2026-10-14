import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listWbsVersions } from "@/modules/wbs/selectors";
import { createWbsVersion } from "@/modules/wbs/wbs";
import { createWbsVersionSchema } from "@/modules/wbs/schemas";

async function projectIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do projeto ausente.");
  return id;
}

// Versionamento da árvore (E05-US05, §74):
// GET  → histórico de versões (WBS:VIEW);
// POST → snapshot manual da árvore atual (WBS:EDIT).

export const { GET, POST } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "WBS", "VIEW");
    const projectId = await projectIdFrom(context);

    const versions = await listWbsVersions(tenant.organizationId, projectId);
    return Response.json({ versions });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "WBS", "EDIT");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = createWbsVersionSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados da versão inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const version = await createWbsVersion({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      projectId,
      note: parsed.data.note,
    });

    return Response.json({ version }, { status: 201 });
  },
});
