import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { getProjectDetail } from "@/modules/portfolio/selectors";
import {
  getProcurementBoard,
  listGoodsReceipts,
  listPurchaseOrders,
  listPurchaseRequests,
  listQuotations,
  listSuppliers,
} from "@/modules/procurement/selectors";
import { getWbsTree } from "@/modules/wbs/selectors";
import { flattenWbsTree } from "@/modules/wbs/engine";
import { listActivities } from "@/modules/schedule/selectors";
import { listCostItems } from "@/modules/cost/selectors";
import { ProcurementView } from "@/components/procurement/procurement-view";
import type {
  GoodsReceiptRow,
  PurchaseOrderRow,
  PurchaseRequestRow,
  QuotationRow,
  SupplierRow,
} from "@/components/procurement/procurement-view";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "Suprimentos do projeto" };

// Suprimentos do projeto (E14-US01..US03, §49): Requisições de compra,
// cotações de fornecedores e mapa comparativo com equalização.
export default async function ProjetoSuprimentosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "PROCUREMENT", "VIEW")) {
    return <NoPermission required="PROCUREMENT:VIEW" />;
  }

  const project = await getProjectDetail(context.organizationId, id);

  const [summary, requests, quotations, suppliers, purchaseOrders, goodsReceipts, tree, activityRows, costItemRows] =
    await Promise.all([
      getProcurementBoard(context.organizationId, id),
      listPurchaseRequests(context.organizationId, id),
      listQuotations(id),
      listSuppliers(context.organizationId),
      listPurchaseOrders(id),
      listGoodsReceipts(id),
      getWbsTree(context.organizationId, id),
      listActivities(context.organizationId, id),
      listCostItems(context.organizationId, id),
    ]);

  const wbsNodes = flattenWbsTree(tree).map((node) => ({
    id: node.id,
    label: `${node.path} → ${node.name}`,
  }));

  const activities = activityRows.map((activity) => ({
    id: activity.id,
    label: `${activity.code} — ${activity.name}`,
  }));

  const costItems = costItemRows.map((ci) => ({
    id: ci.id,
    label: `${ci.code} — ${ci.description}`,
  }));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{project.code}</span>
          <span className="text-xs text-muted-foreground">•</span>
          <span className="text-xs text-muted-foreground">{project.name}</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Suprimentos</h1>
        <p className="text-sm text-muted-foreground">
          Requisições de compra (PR), cotações e mapa comparativo de propostas comerciais (E14, §49).
        </p>
      </div>

      <ProcurementView
        projectId={id}
        initialSummary={summary}
        initialRequests={requests as unknown as PurchaseRequestRow[]}
        initialQuotations={quotations as unknown as QuotationRow[]}
        initialSuppliers={suppliers as unknown as SupplierRow[]}
        initialPurchaseOrders={purchaseOrders as unknown as PurchaseOrderRow[]}
        initialGoodsReceipts={goodsReceipts as unknown as GoodsReceiptRow[]}
        wbsNodes={wbsNodes}
        activities={activities}
        costItems={costItems}
        canCreate={can(permissions, "PROCUREMENT", "CREATE")}
        canEdit={can(permissions, "PROCUREMENT", "EDIT")}
        canApprove={can(permissions, "PROCUREMENT", "APPROVE")}
        canDelete={can(permissions, "PROCUREMENT", "DELETE")}
      />
    </div>
  );
}

