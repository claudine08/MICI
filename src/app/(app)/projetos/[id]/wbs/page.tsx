import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { getProjectDetail } from "@/modules/portfolio/selectors";
import { getWbsTree, listWbsVersions } from "@/modules/wbs/selectors";
import { WbsView } from "@/components/wbs/wbs-view";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "WBS do projeto" };

export default async function ProjetoWbsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "WBS", "VIEW")) {
    return <NoPermission required="WBS:VIEW" />;
  }

  const project = await getProjectDetail(context.organizationId, id);
  const [tree, versions] = await Promise.all([
    getWbsTree(context.organizationId, id),
    listWbsVersions(context.organizationId, id),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          WBS — {project.code} {project.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Árvore de decomposição (E05-US01…US05): reordenar, importar/exportar e versionar
          snapshots (§74).
        </p>
      </div>
      <WbsView
        projectId={id}
        tree={tree}
        versions={versions}
        canCreate={can(permissions, "WBS", "CREATE")}
        canEdit={can(permissions, "WBS", "EDIT")}
        canDelete={can(permissions, "WBS", "DELETE")}
      />
    </div>
  );
}
