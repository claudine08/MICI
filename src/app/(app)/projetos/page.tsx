import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { listProjects, listClients, listTemplates } from "@/modules/portfolio/selectors";
import { ProjectsView } from "@/components/portfolio/projects-view";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "Projetos" };

export default async function ProjetosPage() {
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "PROJECT", "VIEW")) {
    return <NoPermission required="PROJECT:VIEW" />;
  }

  const [projects, clients, templates] = await Promise.all([
    listProjects(context.organizationId),
    listClients(context.organizationId),
    listTemplates(context.organizationId),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Projetos</h1>
        <p className="text-sm text-muted-foreground">
          Portfólio da organização {context.organizationName} — gates e fases seguem a matriz
          oficial MICI (§17/§18).
        </p>
      </div>
      <ProjectsView
        projects={projects}
        clients={clients.map((client) => ({ id: client.id, name: client.name }))}
        templates={templates.map((template) => ({ id: template.id, name: template.name }))}
        canCreate={can(permissions, "PROJECT", "CREATE")}
        canEdit={can(permissions, "PROJECT", "EDIT")}
      />
    </div>
  );
}
