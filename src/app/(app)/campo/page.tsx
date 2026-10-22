import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { listFieldSummaries } from "@/modules/field/selectors";
import { NoPermission } from "@/components/shell/no-permission";
import Link from "next/link";

export const metadata = { title: "Campo" };

// Home de campo da organização (E12-US06, §38): quadro Hoje / Esta semana /
// Atrasadas / Restrições por projeto, com atalho para o campo do projeto.
export default async function CampoPage() {
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "FIELD", "VIEW")) {
    return <NoPermission required="FIELD:VIEW" />;
  }

  const summaries = await listFieldSummaries(context.organizationId);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Campo</h1>
        <p className="text-sm text-muted-foreground">
          Diários, tarefas e restrições do canteiro — Hoje / Esta semana / Atrasadas /
          Restrições (E12-US06, §38).
        </p>
      </div>

      {summaries.length === 0 && (
        <p className="rounded-lg border border-border bg-surface px-4 py-6 text-sm text-muted-foreground">
          Nenhum projeto ativo com registros de campo.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {summaries.map((summary) => (
          <Link
            key={summary.projectId}
            href={`/projetos/${summary.projectId}/campo`}
            className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                {summary.projectCode}
              </span>
              <span className="text-xs text-muted-foreground">
                {summary.openTasks} tarefas abertas
              </span>
            </div>
            <div className="mt-1 truncate text-sm font-medium">{summary.projectName}</div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {[
                { label: "Hoje", value: summary.board.today },
                { label: "Semana", value: summary.board.thisWeek },
                { label: "Atrasadas", value: summary.board.overdue },
                { label: "Restrições", value: summary.board.openConstraints },
              ].map((cell) => (
                <div key={cell.label} className="rounded border border-border bg-background p-1">
                  <div className="text-[10px] uppercase text-muted-foreground">{cell.label}</div>
                  <div className="text-sm font-medium">{cell.value}</div>
                </div>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
