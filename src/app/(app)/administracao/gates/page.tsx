import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { listGateDefinitions } from "@/modules/gates/definitions";
import { GateDefinitionsView } from "@/components/admin/gate-definitions-view";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "Gates e critérios" };

export default async function GatesPage() {
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "GATE", "VIEW")) {
    return <NoPermission required="GATE:VIEW" />;
  }

  const definitions = await listGateDefinitions(context.organizationId);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Gates e critérios</h1>
        <p className="text-sm text-muted-foreground">
          Definições de gate da organização {context.organizationName} (§17.1). Os gates G0–G8
          são do sistema; gates customizados são livres.
        </p>
      </div>
      <GateDefinitionsView
        definitions={definitions}
        canCreate={can(permissions, "GATE", "CREATE")}
        canEdit={can(permissions, "GATE", "EDIT")}
        canDelete={can(permissions, "GATE", "DELETE")}
      />
    </div>
  );
}
