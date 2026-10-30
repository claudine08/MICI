import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { listProjects } from "@/modules/portfolio/selectors";
import { prisma } from "@/lib/prisma";
import { NoPermission } from "@/components/shell/no-permission";
import Link from "next/link";

export const metadata = { title: "Suprimentos" };

// Visão geral de suprimentos da organização (E14, §49):
// Resumo por projeto com requisições, cotações e status.
export default async function SuprimentosPage() {
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "PROCUREMENT", "VIEW")) {
    return <NoPermission required="PROCUREMENT:VIEW" />;
  }

  const projects = await listProjects(context.organizationId);

  const summaries = await Promise.all(
    projects.map(async (project) => {
      const [requests, quotations] = await Promise.all([
        prisma.purchaseRequest.findMany({
          where: { organizationId: context.organizationId, projectId: project.id, deletedAt: null },
          select: { status: true },
        }),
        prisma.quotation.findMany({
          where: { organizationId: context.organizationId, projectId: project.id, deletedAt: null },
          select: { status: true },
        }),
      ]);

      return {
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        totalRequests: requests.length,
        openRequests: requests.filter((r) => r.status === "DRAFT" || r.status === "SUBMITTED").length,
        quotingRequests: requests.filter((r) => r.status === "QUOTING").length,
        comparedRequests: requests.filter((r) => r.status === "COMPARED").length,
        approvedRequests: requests.filter((r) => r.status === "APPROVED").length,
        totalQuotations: quotations.length,
      };
    })
  );

  const totalSuppliers = await prisma.supplier.count({
    where: { organizationId: context.organizationId, deletedAt: null },
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Suprimentos</h1>
          <p className="text-sm text-muted-foreground">
            Requisições de compra, cotações com fornecedores e equalização de propostas (E14, §49).
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs text-muted-foreground">Fornecedores Homologados: </span>
          <span className="font-semibold">{totalSuppliers}</span>
        </div>
      </div>

      {summaries.length === 0 && (
        <p className="rounded-lg border border-border bg-surface px-4 py-6 text-sm text-muted-foreground">
          Nenhum projeto ativo para suprimentos.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {summaries.map((summary) => (
          <Link
            key={summary.projectId}
            href={`/projetos/${summary.projectId}/suprimentos`}
            className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                {summary.projectCode}
              </span>
              <span className="text-xs text-muted-foreground">
                {summary.openRequests} aberta(s)
              </span>
            </div>
            <div className="mt-1 truncate text-sm font-medium">{summary.projectName}</div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {[
                { label: "Requisições", value: summary.totalRequests },
                { label: "Em cotação", value: summary.quotingRequests },
                { label: "Cotadas", value: summary.comparedRequests },
                { label: "Aprovadas", value: summary.approvedRequests },
              ].map((cell) => (
                <div key={cell.label} className="rounded bg-muted/40 p-1.5">
                  <div className="text-xs font-semibold">{cell.value}</div>
                  <div className="text-[10px] text-muted-foreground">{cell.label}</div>
                </div>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

