import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { NoPermission } from "@/components/shell/no-permission";
import { PmoView } from "@/components/pmo/pmo-view";

export const metadata = { title: "PMO" };

export default async function PmoPage() {
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);
  if (!can(permissions, "PMO", "VIEW")) {
    return <NoPermission required="PMO:VIEW" />;
  }
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight">PMO — Portfólio</h1>
      <p className="text-sm text-muted-foreground">
        Visão global e detalhada do status de todos os projetos e módulos.
      </p>
      <PmoView />
    </div>
  );
}