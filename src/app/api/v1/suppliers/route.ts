import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listSuppliers } from "@/modules/procurement/selectors";
import { createSupplier } from "@/modules/procurement/suppliers";
import { createSupplierSchema } from "@/modules/procurement/schemas";
import { actorOf } from "@/modules/procurement/http";

export const { GET, POST } = apiHandler({
  GET: async () => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "VIEW");
    const suppliers = await listSuppliers(tenant.organizationId);
    return Response.json({ suppliers });
  },

  POST: async (request: NextRequest) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "CREATE");

    const body = await request.json().catch(() => null);
    const parsed = createSupplierSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados do fornecedor inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const supplier = await createSupplier(parsed.data, actorOf(tenant, request));
    return Response.json({ supplier }, { status: 201 });
  },
});

