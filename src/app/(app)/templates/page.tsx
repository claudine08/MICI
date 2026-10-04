import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { listTemplates } from "@/modules/portfolio/selectors";
import { TemplatesView } from "@/components/portfolio/templates-view";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "PROJECT", "VIEW")) {
    return <NoPermission required="PROJECT:VIEW" />;
  }

  const templates = await listTemplates(context.organizationId);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Templates de projeto</h1>
        <p className="text-sm text-muted-foreground">
          Templates corporativos da organização (E03-US04). Conteúdo completo (WBS,
          checklists) chega nas fases seguintes.
        </p>
      </div>
      <TemplatesView
        templates={templates}
        canCreate={can(permissions, "PROJECT", "CREATE")}
        canEdit={can(permissions, "PROJECT", "EDIT")}
        canDelete={can(permissions, "PROJECT", "DELETE")}
      />
    </div>
  );
}
