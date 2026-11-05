import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { getProjectDetail } from "@/modules/portfolio/selectors";
import { getWbsTree } from "@/modules/wbs/selectors";
import { flattenWbsTree } from "@/modules/wbs/engine";
import { listCostItems, listCommitments, listActuals } from "@/modules/cost/selectors";
import { prisma } from "@/lib/prisma";
import { listCostBaselines } from "@/modules/cost/baselines";
import { calculateProjectEvm } from "@/modules/cost/evm";
import { CostView } from "@/components/cost/cost-view";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "Custos do projeto" };

export default async function ProjetoCustosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "COST", "VIEW")) {
    return <NoPermission required="COST:VIEW" />;
  }

  const project = await getProjectDetail(context.organizationId, id);
  const tree = await getWbsTree(context.organizationId, id);
  const wbsNodes = flattenWbsTree(tree).map((node) => ({
    id: node.id,
    code: node.path,
    name: node.name,
  }));

  const [items, commitments, actuals, baselines, evm, approvals] = await Promise.all([
    listCostItems(context.organizationId, id),
    listCommitments(context.organizationId, id),
    listActuals(context.organizationId, id),
    listCostBaselines(context.organizationId, id),
    calculateProjectEvm(context.organizationId, id),
    prisma.approvalRequest.findMany({
      where: { organizationId: context.organizationId, projectId: id, objectType: { in: ["COST_ITEM", "PROJECT_COST_TOTAL"] } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const approvalMap = new Map<string, string>();
  for (const a of approvals) {
    if (!approvalMap.has(a.objectId)) approvalMap.set(a.objectId, a.status);
  }
  const itemsWithApproval = items.map((it) => ({ ...it, approvalStatus: approvalMap.get(it.id) ?? null }));
  const projectApprovalStatus = approvalMap.get(id) ?? null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Custos — {project.code} {project.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Itens de orçamento, compromissos, custos realizados, baseline de custo e EVM
          (PV/EV/AC/CPI/SPI/EAC) — E08-US01…US06, §29.
        </p>
      </div>
      <CostView
        projectId={id}
        wbsNodes={wbsNodes}
        initialData={{ items: itemsWithApproval, commitments, actuals, baselines, evm }}
        canCreate={can(permissions, "COST", "CREATE")}
        canEdit={can(permissions, "COST", "EDIT")}
        canDelete={can(permissions, "COST", "DELETE")}
        canApprove={can(permissions, "COST", "APPROVE")}
        projectApprovalStatus={projectApprovalStatus}
      />
    </div>
  );
}
