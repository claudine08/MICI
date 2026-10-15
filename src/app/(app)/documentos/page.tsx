import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { listProjects } from "@/modules/portfolio/selectors";
import { listDocumentSummaries } from "@/modules/documents/selectors";
import { Badge } from "@/components/ui/badge";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "Documentos" };

// Visão de documentos da organização (E09, §36): uma linha por projeto com
// total, liberados e em análise — links para a tela por projeto.

export default async function DocumentosPage() {
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "DOCUMENT", "VIEW")) {
    return <NoPermission required="DOCUMENT:VIEW" />;
  }

  const [projects, summaries] = await Promise.all([
    listProjects(context.organizationId),
    listDocumentSummaries(context.organizationId),
  ]);
  const summaryByProject = new Map(summaries.map((row) => [row.projectId, row]));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Documentos</h1>
        <p className="text-sm text-muted-foreground">
          Documentos por projeto — revisões, aprovação e liberação (E09, §36) — clique
          para abrir os documentos detalhados.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="px-4 py-2.5">Projeto</th>
              <th className="px-4 py-2.5">Documentos</th>
              <th className="px-4 py-2.5">Liberados</th>
              <th className="px-4 py-2.5">Em análise</th>
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
                    {summary && summary.documentCount > 0 ? (
                      <Badge variant="secondary">{summary.documentCount}</Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5">{summary?.releasedCount ?? 0}</td>
                  <td className="px-4 py-2.5">{summary?.inReviewCount ?? 0}</td>
                  <td className="px-4 py-2.5 text-right">
                    <a
                      className="underline-offset-2 hover:underline"
                      href={`/projetos/${project.id}/documentos`}
                    >
                      Abrir
                    </a>
                  </td>
                </tr>
              );
            })}
            {projects.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
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
