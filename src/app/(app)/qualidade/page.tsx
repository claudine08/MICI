import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { listQualitySummaries } from "@/modules/quality/selectors";
import { NoPermission } from "@/components/shell/no-permission";
import Link from "next/link";

export const metadata = { title: "Qualidade" };

// Home de qualidade da organização (E13, §33): resumo por projeto —
// modelos, execuções pendentes, inspeções abertas/reprovadas/encerradas.
export default async function QualidadePage() {
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "QUALITY", "VIEW")) {
    return <NoPermission required="QUALITY:VIEW" />;
  }

  const summaries = await listQualitySummaries(context.organizationId);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Qualidade</h1>
        <p className="text-sm text-muted-foreground">
          Checklists e inspeções com critério de aceite — Planned → Executed → Passed / Failed →
          Closed (E13-US01/US02, §33).
        </p>
      </div>

      {summaries.length === 0 && (
        <p className="rounded-lg border border-border bg-surface px-4 py-6 text-sm text-muted-foreground">
          Nenhum projeto ativo para a qualidade.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {summaries.map((summary) => (
          <Link
            key={summary.projectId}
            href={`/projetos/${summary.projectId}/qualidade`}
            className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                {summary.projectCode}
              </span>
              <span className="text-xs text-muted-foreground">
                {summary.board.open} inspeção(ões) aberta(s)
              </span>
            </div>
            <div className="mt-1 truncate text-sm font-medium">{summary.projectName}</div>
            <div className="mt-3 grid grid-cols-5 gap-2 text-center">
              {[
                { label: "Modelos", value: summary.board.templates },
                { label: "Execuções", value: summary.board.executions },
                { label: "Pendentes", value: summary.board.executionsPending },
                { label: "Reprovadas", value: summary.board.failed },
                { label: "Encerradas", value: summary.board.closed },
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
