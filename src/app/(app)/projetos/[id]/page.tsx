import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { getProjectDetail, listClients, listTemplates } from "@/modules/portfolio/selectors";
import { listProjectGateInstances } from "@/modules/gates/instances";
import { listMembers } from "@/modules/identity/selectors";
import { ProjectDetailView } from "@/components/portfolio/project-detail-view";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "Projeto" };

export default async function ProjetoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "PROJECT", "VIEW")) {
    return <NoPermission required="PROJECT:VIEW" />;
  }

  const project = await getProjectDetail(context.organizationId, id);
  const [gates, clients, templates, members] = await Promise.all([
    listProjectGateInstances(context.organizationId, id, context.userId),
    listClients(context.organizationId),
    listTemplates(context.organizationId),
    listMembers(context.organizationId),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Projeto</h1>
        <p className="text-sm text-muted-foreground">
          Fase e status são distintos (§14.2); o avanço de fase obedece ao BR-001.
        </p>
      </div>
      <ProjectDetailView
        project={project}
        gates={gates}
        clients={clients.map((client) => ({ id: client.id, name: client.name }))}
        templates={templates.map((template) => ({ id: template.id, name: template.name }))}
        members={members.map((member) => ({ id: member.userId, name: member.name }))}
        canEdit={can(permissions, "PROJECT", "EDIT")}
        canManageGates={can(permissions, "GATE", "EDIT")}
        canApproveGates={can(permissions, "GATE", "APPROVE")}
        canRejectGates={can(permissions, "GATE", "REJECT")}
      />
    </div>
  );
}
