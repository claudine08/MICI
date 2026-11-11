import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getSupplierRfi } from "@/modules/supplier-rfi/selectors";
import { cancelRfi } from "@/modules/supplier-rfi/supplier-rfi";

async function idFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id ausente.");
  return id;
}

export const { GET, DELETE } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "VIEW");
    const id = await idFrom(context);
    const rfi = await getSupplierRfi(tenant.organizationId, id);
    return Response.json({ rfi });
  },
  DELETE: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "DELETE");
    const id = await idFrom(context);
    const result = await cancelRfi({ organizationId: tenant.organizationId, actorId: tenant.userId, actorLabel: tenant.userEmail, rfiId: id });
    return Response.json(result);
  },
});