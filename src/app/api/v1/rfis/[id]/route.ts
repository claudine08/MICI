import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getRfi } from "@/modules/rfi/selectors";
import { updateRfi, deleteRfi } from "@/modules/rfi/rfi";
import { updateRfiSchema } from "@/modules/rfi/schemas";

async function idFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id ausente.");
  return id;
}

export const { GET, PATCH, DELETE } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROJECT", "VIEW");
    const id = await idFrom(context);
    const rfi = await getRfi(tenant.organizationId, id);
    return Response.json({ rfi });
  },
  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROJECT", "EDIT");
    const id = await idFrom(context);
    const body = await request.json();
    const parsed = updateRfiSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Dados inválidos.", { details: parsed.error.flatten() });
    const rfi = await updateRfi({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      rfiId: id,
      ...parsed.data,
    });
    return Response.json({ rfi });
  },
  DELETE: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROJECT", "DELETE");
    const id = await idFrom(context);
    const result = await deleteRfi({ organizationId: tenant.organizationId, actorId: tenant.userId, actorLabel: tenant.userEmail, rfiId: id });
    return Response.json(result);
  },
});