import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { listRoles, listPermissionsCatalog } from "@/modules/identity/selectors";
import { RolesView } from "@/components/admin/roles-view";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "Papéis e permissões" };

export default async function PapeisPage() {
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "ROLE", "VIEW")) {
    return <NoPermission required="ROLE:VIEW" />;
  }

  const [roles, catalog] = await Promise.all([
    listRoles(context.organizationId),
    listPermissionsCatalog(),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Papéis e permissões</h1>
        <p className="text-sm text-muted-foreground">
          Matriz RBAC da organização: 25 módulos × 8 ações (VIEW, CREATE, EDIT, APPROVE, REJECT,
          DELETE, EXPORT, ADMIN).
        </p>
      </div>
      <RolesView
        roles={roles}
        catalog={catalog}
        canCreate={can(permissions, "ROLE", "CREATE")}
      />
    </div>
  );
}
