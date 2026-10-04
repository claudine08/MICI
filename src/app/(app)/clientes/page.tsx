import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { listClients } from "@/modules/portfolio/selectors";
import { ClientsView } from "@/components/portfolio/clients-view";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "Clientes" };

export default async function ClientesPage() {
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "PROJECT", "VIEW")) {
    return <NoPermission required="PROJECT:VIEW" />;
  }

  const clients = await listClients(context.organizationId);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Clientes</h1>
        <p className="text-sm text-muted-foreground">
          Base de clientes da organização {context.organizationName} (E03-US02).
        </p>
      </div>
      <ClientsView
        clients={clients}
        canCreate={can(permissions, "PROJECT", "CREATE")}
        canEdit={can(permissions, "PROJECT", "EDIT")}
        canDelete={can(permissions, "PROJECT", "DELETE")}
      />
    </div>
  );
}
