import { apiHandler } from "@/core/api";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listPermissionsCatalog } from "@/modules/identity/selectors";

// Catálogo global de permissões (25 módulos × 8 ações) — ROLE:VIEW.
export const { GET } = apiHandler({
  GET: async () => {
    const context = await requireTenantContext();
    assertPermission(context, "ROLE", "VIEW");
    const permissions = await listPermissionsCatalog();
    return Response.json({ permissions });
  },
});
