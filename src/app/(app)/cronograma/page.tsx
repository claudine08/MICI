import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { listProjects } from "@/modules/portfolio/selectors";
import { listScheduleSummaries } from "@/modules/schedule/selectors";
import { Badge } from "@/components/ui/badge";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "Cronograma" };

// Visão única do cronograma da organização (E07): uma linha por projeto com
// atividades, críticas, avanço e fim previsto — links para a tela por projeto.

export default async function CronogramaPage() {
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "SCHEDULE", "VIEW")) {
    return <NoPermission required="SCHEDULE:VIEW" />;
  }

  const [projects, summaries] = await Promise.all([
    listProjects(context.organizationId),
    listScheduleSummaries(context.organizationId),
  ]);
  const summaryByProject = new Map(summaries.map((row) => [row.projectId, row]));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Cronograma</h1>
        <p className="text-sm text-muted-foreground">
          Atividades, críticas, avanço e fim previsto de todos os projetos (E07, §27) —
          clique para abrir o cronograma detalhado.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="px-4 py-2.5">Projeto</th>
              <th className="px-4 py-2.5">Atividades</th>
              <th className="px-4 py-2.5">Críticas</th>
              <th className="px-4 py-2.5">Avanço</th>
              <th className="px-4 py-2.5">Fim previsto</th>
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
                  <td className="px-4 py-2.5">{summary?.activityCount ?? 0}</td>
                  <td className="px-4 py-2.5">
                    {summary && summary.criticalCount > 0 ? (
                      <Badge variant="destructive">{summary.criticalCount}</Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5">{summary ? `${summary.averageProgress}%` : "—"}</td>
                  <td className="px-4 py-2.5">{summary?.forecastFinish ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <a
                      className="underline-offset-2 hover:underline"
                      href={`/projetos/${project.id}/cronograma`}
                    >
                      Abrir
                    </a>
                  </td>
                </tr>
              );
            })}
            {projects.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
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
