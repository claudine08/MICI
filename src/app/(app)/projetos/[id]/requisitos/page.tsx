import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { getProjectDetail } from "@/modules/portfolio/selectors";
import { listRequirements } from "@/modules/requirements/selectors";
import { getWbsTree } from "@/modules/wbs/selectors";
import { listMembers } from "@/modules/identity/selectors";
import { flattenWbsTree } from "@/modules/wbs/engine";
import { RequirementsView } from "@/components/requirements/requirements-view";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "Requisitos do projeto" };

export default async function ProjetoRequisitosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "REQUIREMENT", "VIEW")) {
    return <NoPermission required="REQUIREMENT:VIEW" />;
  }

  const project = await getProjectDetail(context.organizationId, id);
  const [requirements, wbsTree, members] = await Promise.all([
    listRequirements(context.organizationId, { projectId: id }),
    getWbsTree(context.organizationId, id),
    listMembers(context.organizationId),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Requisitos — {project.code} {project.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Cadastro, versionamento e DRP (E04-US01…US05); o gate G1 exige DRP completo para ser
          aprovado (§18).
        </p>
      </div>
      <RequirementsView
        projectId={id}
        requirements={requirements}
        wbsOptions={flattenWbsTree(wbsTree).map((node) => ({
          id: node.id,
          code: node.code,
          name: node.name,
        }))}
        members={members.map((member) => ({ id: member.userId, name: member.name }))}
        canCreate={can(permissions, "REQUIREMENT", "CREATE")}
        canEdit={can(permissions, "REQUIREMENT", "EDIT")}
        canDelete={can(permissions, "REQUIREMENT", "DELETE")}
      />
    </div>
  );
}
