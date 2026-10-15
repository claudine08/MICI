import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { listProjects } from "@/modules/portfolio/selectors";
import { listCostSummaries } from "@/modules/cost/selectors";
import { Badge } from "@/components/ui/badge";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "Custos" };

// Visão de custos da organização (E08, §29): uma linha por projeto com itens
// de orçamento, total, comprometido e realizado — links para a tela por
// projeto.

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export default async function CustosPage() {
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "COST", "VIEW")) {
    return <NoPermission required="COST:VIEW" />;
  }

  const [projects, summaries] = await Promise.all([
    listProjects(context.organizationId),
    listCostSummaries(context.organizationId),
  ]);
  const summaryByProject = new Map(summaries.map((row) => [row.projectId, row]));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Custos</h1>
        <p className="text-sm text-muted-foreground">
          Orçamento, comprometido e realizado de todos os projetos (E08, §29) —
          clique para abrir os custos detalhados.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="px-4 py-2.5">Projeto</th>
              <th className="px-4 py-2.5">Itens</th>
              <th className="px-4 py-2.5">Orçamento</th>
              <th className="px-4 py-2.5">Comprometido</th>
              <th className="px-4 py-2.5">Realizado</th>
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
                    {summary && summary.itemCount > 0 ? (
                      <Badge variant="secondary">{summary.itemCount}</Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {summary ? formatBRL(summary.totalBudget) : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {summary ? formatBRL(summary.commitmentTotal) : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {summary ? formatBRL(summary.actualTotal) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <a
                      className="underline-offset-2 hover:underline"
                      href={`/projetos/${project.id}/custos`}
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
