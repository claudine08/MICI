import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { prisma } from "@/lib/prisma";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "Observabilidade" };

export default async function ObservabilidadePage() {
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "AUDIT", "VIEW") && !can(permissions, "SETTING", "VIEW")) {
    return <NoPermission required="AUDIT:VIEW ou SETTING:VIEW" />;
  }

  const [aiTotal, aiErrors, tokensAgg, jobsPending, jobsFailed] = await Promise.all([
    prisma.aiRequest.count(),
    prisma.aiRequest.count({ where: { status: "ERROR" } }),
    prisma.aiRequest.aggregate({ _sum: { tokensIn: true, tokensOut: true } }),
    prisma.jobQueue.count({ where: { status: "PENDING" } }),
    prisma.jobQueue.count({ where: { status: "FAILED" } }),
  ]);

  let neonConnections = 0;
  try {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*)::bigint AS count FROM pg_stat_activity`;
    neonConnections = Number(rows[0]?.count ?? 0);
  } catch {
    neonConnections = -1;
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Observabilidade</h1>
        <p className="text-sm text-muted-foreground">
          Métricas de IA, fila de jobs e saúde do banco.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Requisições de IA</div>
          <div className="text-2xl font-semibold">{aiTotal}</div>
          <div className="text-xs text-muted-foreground">Erros: {aiErrors}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Tokens</div>
          <div className="text-2xl font-semibold">
            {(tokensAgg._sum.tokensIn ?? 0) + (tokensAgg._sum.tokensOut ?? 0)}
          </div>
          <div className="text-xs text-muted-foreground">
            In: {tokensAgg._sum.tokensIn ?? 0} · Out: {tokensAgg._sum.tokensOut ?? 0}
          </div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Conexões Neon</div>
          <div className="text-2xl font-semibold">{neonConnections >= 0 ? neonConnections : "n/a"}</div>
        </div>
      </div>
      <div className="rounded-lg border p-4">
        <div className="text-sm text-muted-foreground">Fila de jobs (job_queue)</div>
        <div className="text-sm">
          Pendentes: {jobsPending} · Falhas: {jobsFailed}
        </div>
      </div>
    </div>
  );
}