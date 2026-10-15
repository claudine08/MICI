import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listCostItems } from "@/modules/cost/selectors";
import { createCostItem } from "@/modules/cost/items";
import { createCostItemSchema } from "@/modules/cost/schemas";

async function projectIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do projeto ausente.");
  return id;
}

// Itens de custo (E08 §29):
// GET → lista os itens vivos do projeto (COST:VIEW).
// POST → cria item (COST:CREATE). Compromissos, realizados, baselines e EVM
// ficam nas rotas irmãs /cost/{commitments,actuals,baselines,evm,import-estimate}.
export const { GET, POST } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COST", "VIEW");
    const projectId = await projectIdFrom(context);
    const items = await listCostItems(tenant.organizationId, projectId);
    return Response.json({ items });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COST", "CREATE");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = createCostItemSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Item de custo inválido.", {
        details: parsed.error.flatten(),
      });
    }

    const item = await createCostItem({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      projectId,
      ...parsed.data,
    });
    return Response.json({ item }, { status: 201 });
  },
});
