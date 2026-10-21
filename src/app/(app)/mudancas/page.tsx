import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { listProjects } from "@/modules/portfolio/selectors";
import { listChangeSummaries } from "@/modules/change/selectors";
import { Badge } from "@/components/ui/badge";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "Mudanças" };

// Visão de mudanças da organização (E11, §31): uma linha por projeto com
// contagens de mudanças abertas, aguardando aprovação, aprovadas, rejeitadas
// e de alto impacto — links para o controle por projeto.

export default async function MudancasPage() {
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "CHANGE", "VIEW")) {
    return <NoPermission required="CHANGE:VIEW" />;
  }

  const [projects, summaries] = await Promise.all([
    listProjects(context.organizationId),
    listChangeSummaries(context.organizationId),
  ]);
  const summaryByProject = new Map(summaries.map((row) => [row.projectId, row]));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Mudanças</h1>
        <p className="text-sm text-muted-foreground">
          Mudanças abertas, aguardando aprovação, decididas e de alto impacto por projeto
          (E11, §31).
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="px-4 py-2.5">Projeto</th>
              <th className="px-4 py-2.5">Mudanças</th>
              <th className="px-4 py-2.5">Abertas</th>
              <th className="px-4 py-2.5">Aguardando aprovação</th>
              <th className="px-4 py-2.5">Aprovadas</th>
              <th className="px-4 py-2.5">Rejeitadas</th>
              <th className="px-4 py-2.5">Alto impacto</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => {
              const summary = summaryByProject.get(project.id);
              return (
                <tr key={project.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs text-muted-foreground">{project.code}</span>{" "}
                    {project.name}
                  </td>
                  <td className="px-4 py-2.5">
                    {summary ? <Badge variant="secondary">{summary.totalCount}</Badge> : "—"}
                  </td>
                  <td className="px-4 py-2.5">{summary?.openCount ?? 0}</td>
                  <td className="px-4 py-2.5">
                    {summary && summary.waitingApprovalCount > 0 ? (
                      <Badge variant="warning">{summary.waitingApprovalCount}</Badge>
                    ) : (
                      0
                    )}
                  </td>
                  <td className="px-4 py-2.5">{summary?.approvedCount ?? 0}</td>
                  <td className="px-4 py-2.5">
                    {summary && summary.rejectedCount > 0 ? (
                      <Badge variant="destructive">{summary.rejectedCount}</Badge>
                    ) : (
                      0
                    )}
                  </td>
                  <td className="px-4 py-2.5">{summary?.highImpactCount ?? 0}</td>
                  <td className="px-4 py-2.5 text-right">
                    <a
                      className="underline-offset-2 hover:underline"
                      href={`/projetos/${project.id}/mudancas`}
                    >
                      Abrir
                    </a>
                  </td>
                </tr>
              );
            })}
            {projects.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum projeto encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
