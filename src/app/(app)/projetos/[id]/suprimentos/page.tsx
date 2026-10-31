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

  const mappedRequests: PurchaseRequestRow[] = requests.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    description: r.description,
    priority: r.priority as PurchaseRequestRow["priority"],
    status: r.status as PurchaseRequestRow["status"],
    requiredDate: r.requiredDate,
    costCenter: r.costCenter,
    wbsNodeId: r.wbsNodeId,
    activityId: r.activityId,
    costItemId: r.costItemId,
    items: (r.items ?? []).map((it) => ({
      id: it.id,
      itemNumber: it.itemNumber,
      description: it.description,
      quantity: Number(it.quantity),
      unit: it.unit,
      estimatedUnitPrice: it.estimatedUnitPrice != null ? Number(it.estimatedUnitPrice) : null,
      estimatedTotalPrice: it.estimatedTotalPrice != null ? Number(it.estimatedTotalPrice) : null,
    })),
    _count: r._count,
  }));

  const mappedQuotations: QuotationRow[] = quotations.map((q) => ({
    id: q.id,
    requestId: q.requestId,
    supplierId: q.supplierId,
    code: q.code,
    status: q.status as QuotationRow["status"],
    leadTimeDays: q.leadTimeDays,
    paymentTerms: q.paymentTerms,
    shippingTerms: q.shippingTerms,
    shippingCost: q.shippingCost != null ? Number(q.shippingCost) : undefined,
    discount: q.discount != null ? Number(q.discount) : undefined,
    totalAmount: Number(q.totalAmount),
    supplier: q.supplier ? { id: q.supplier.id, name: q.supplier.name } : undefined,
    request: q.request ? { id: q.request.id, code: q.request.code, title: q.request.title } : undefined,
  }));

  const mappedSuppliers: SupplierRow[] = suppliers.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    tradeName: s.tradeName,
    taxId: s.taxId,
    category: s.category,
    email: s.email,
    phone: s.phone,
    status: s.status as SupplierRow["status"],
  }));

  const mappedOrders: PurchaseOrderRow[] = purchaseOrders.map((o) => ({
    id: o.id,
    code: o.code,
    status: o.status,
    supplier: o.supplier ? { id: o.supplier.id, name: o.supplier.name } : undefined,
    request: o.request ? { id: o.request.id, code: o.request.code, title: o.request.title } : null,
    totalAmount: Number(o.totalAmount),
    expectedDeliveryDate: o.expectedDeliveryDate,
    items: (o.items ?? []).map((it) => ({
      id: it.id,
      description: it.description,
      quantity: Number(it.quantity),
      receivedQuantity: Number(it.receivedQuantity),
      unit: it.unit,
    })),
  }));

  const mappedReceipts: GoodsReceiptRow[] = goodsReceipts.map((g) => ({
    id: g.id,
    code: g.code,
    status: g.status,
    purchaseOrder: g.purchaseOrder ? { id: g.purchaseOrder.id, code: g.purchaseOrder.code } : null,
    receiptDate: g.receiptDate,
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
        initialRequests={mappedRequests}
        initialQuotations={mappedQuotations}
        initialSuppliers={mappedSuppliers}
        initialPurchaseOrders={mappedOrders}
        initialGoodsReceipts={mappedReceipts}
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

