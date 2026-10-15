import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { updateCostItem, deleteCostItem } from "@/modules/cost/items";
import { updateCostItemSchema } from "@/modules/cost/schemas";

async function itemIdFrom(context: unknown): Promise<string> {
  const { id, itemId } = await (context as {
    params: Promise<{ id: string; itemId: string }>;
  }).params;
  if (!itemId) throw new AppError("VALIDATION_ERROR", "Id do item ausente.");
  void id;
  return itemId;
}

// Item de custo individual (E08 §29): PATCH edita (COST:EDIT), DELETE exclui
// logicamente (COST:DELETE) — bloqueado enquanto houver vínculo.
export const { PATCH, DELETE } = apiHandler({
  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COST", "EDIT");
    const itemId = await itemIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = updateCostItemSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados inválidos.", { details: parsed.error.flatten() });
    }

    const item = await updateCostItem({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      itemId,
      ...parsed.data,
    });
    return Response.json({ item });
  },

  DELETE: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COST", "DELETE");
    const itemId = await itemIdFrom(context);

    const result = await deleteCostItem({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: _request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: _request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      itemId,
    });
    return Response.json(result);
  },
});
