import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getSupplierById } from "@/modules/procurement/selectors";
import { deleteSupplier, updateSupplier } from "@/modules/procurement/suppliers";
import { updateSupplierSchema } from "@/modules/procurement/schemas";
import { actorOf, idFrom } from "@/modules/procurement/http";

export const { GET, PATCH, DELETE } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "VIEW");
    const supplierId = await idFrom(context, "supplierId");
    const supplier = await getSupplierById(tenant.organizationId, supplierId);
    if (!supplier) throw new AppError("NOT_FOUND", "Fornecedor não encontrado.");
    return Response.json({ supplier });
  },

  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "EDIT");
    const supplierId = await idFrom(context, "supplierId");

    const body = await request.json().catch(() => null);
    const parsed = updateSupplierSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados do fornecedor inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const supplier = await updateSupplier(supplierId, parsed.data, actorOf(tenant, request));
    return Response.json({ supplier });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "DELETE");
    const supplierId = await idFrom(context, "supplierId");
    const result = await deleteSupplier(supplierId, actorOf(tenant, request));
    return Response.json(result);
  },
});

