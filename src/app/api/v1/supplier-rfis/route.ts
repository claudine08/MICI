import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listSupplierRfis } from "@/modules/supplier-rfi/selectors";
import { createSupplierRfi } from "@/modules/supplier-rfi/supplier-rfi";
import { createSupplierRfiSchema } from "@/modules/supplier-rfi/schemas";

export const { GET, POST } = apiHandler({
  GET: async (request: NextRequest) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "VIEW");
    const projectId = request.nextUrl.searchParams.get("projectId") ?? undefined;
    const rfis = await listSupplierRfis(tenant.organizationId, projectId);
    return Response.json({ rfis });
  },
  POST: async (request: NextRequest) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "CREATE");
    const body = await request.json();
    const parsed = createSupplierRfiSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Dados inválidos.", { details: parsed.error.flatten() });
    const rfi = await createSupplierRfi({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      ...parsed.data,
    });
    return Response.json({ rfi }, { status: 201 });
  },
});