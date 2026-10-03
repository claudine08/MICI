import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { listMembers, listRoles } from "@/modules/identity/selectors";
import { MembersView } from "@/components/admin/members-view";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "Usuários" };

export default async function UsuariosPage() {
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "USER", "VIEW")) {
    return <NoPermission required="USER:VIEW" />;
  }

  const [members, roles] = await Promise.all([
    listMembers(context.organizationId),
    listRoles(context.organizationId),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Usuários</h1>
        <p className="text-sm text-muted-foreground">
          Membros da organização {context.organizationName} e seus papéis.
        </p>
      </div>
      <MembersView
        members={members}
        roles={roles.map((role) => ({ code: role.code, name: role.name }))}
        canCreate={can(permissions, "USER", "CREATE")}
        canEdit={can(permissions, "USER", "EDIT")}
      />
    </div>
  );
}
