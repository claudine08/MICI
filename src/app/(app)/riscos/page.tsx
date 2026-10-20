import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { listProjects } from "@/modules/portfolio/selectors";
import { listRiskSummaries, getEffectiveRiskMatrix } from "@/modules/risk/selectors";
import { MatrixConfig } from "@/components/risk/matrix-config";
import { Badge } from "@/components/ui/badge";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "Riscos" };

// Visão de riscos da organização (E10, §32): uma linha por projeto com
// contagens de riscos abertos, críticos, altos e atrasados — links para o
// registro por projeto. A matriz configurável (E10-US02) é editada aqui.

export default async function RiscosPage() {
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "RISK", "VIEW")) {
    return <NoPermission required="RISK:VIEW" />;
  }

  const [projects, summaries, matrix] = await Promise.all([
    listProjects(context.organizationId),
    listRiskSummaries(context.organizationId),
    getEffectiveRiskMatrix(context.organizationId),
  ]);
  const summaryByProject = new Map(summaries.map((row) => [row.projectId, row]));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Riscos</h1>
          <p className="text-sm text-muted-foreground">
            Riscos abertos, níveis alto/crítico e prazos vencidos por projeto
            (E10, §32) — matriz {matrix.isCustom ? "configurada" : "padrão"}{" "}
            (≤{matrix.lowMax}/≤{matrix.mediumMax}/≤{matrix.highMax}/&gt;{matrix.highMax}).
          </p>
        </div>
        <MatrixConfig matrix={matrix} canAdmin={can(permissions, "RISK", "ADMIN")} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="px-4 py-2.5">Projeto</th>
              <th className="px-4 py-2.5">Riscos</th>
              <th className="px-4 py-2.5">Abertos</th>
              <th className="px-4 py-2.5">Críticos</th>
              <th className="px-4 py-2.5">Altos</th>
              <th className="px-4 py-2.5">Atrasados</th>
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
                    {summary && summary.criticalCount > 0 ? (
                      <Badge variant="destructive">{summary.criticalCount}</Badge>
                    ) : (
                      0
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {summary && summary.highCount > 0 ? (
                      <Badge variant="warning">{summary.highCount}</Badge>
                    ) : (
                      0
                    )}
                  </td>
                  <td className="px-4 py-2.5">{summary?.overdueCount ?? 0}</td>
                  <td className="px-4 py-2.5 text-right">
                    <a
                      className="underline-offset-2 hover:underline"
                      href={`/projetos/${project.id}/riscos`}
                    >
                      Abrir
                    </a>
                  </td>
                </tr>
              );
            })}
            {projects.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
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
