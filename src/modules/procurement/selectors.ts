import { prisma } from "@/lib/prisma";
import {
  summarizeProcurementBoard,
  ProcurementBoardSummary,
} from "@/modules/procurement/engine";

// ---------------------------------------------------------------------------
// Fornecedores (Supplier)
// ---------------------------------------------------------------------------

export async function listSuppliers(organizationId: string) {
  return prisma.supplier.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
}

export async function getSupplierById(organizationId: string, supplierId: string) {
  return prisma.supplier.findFirst({
    where: { id: supplierId, organizationId, deletedAt: null },
    include: {
      quotations: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Requisições de Compra (PurchaseRequest)
// ---------------------------------------------------------------------------

export async function listPurchaseRequests(
  organizationId: string,
  projectId: string,
  filters?: { status?: string; costCenter?: string; wbsNodeId?: string }
) {
  return prisma.purchaseRequest.findMany({
    where: {
      organizationId,
      projectId,
      deletedAt: null,
      ...(filters?.status ? { status: filters.status as never } : {}),
      ...(filters?.costCenter ? { costCenter: filters.costCenter } : {}),
      ...(filters?.wbsNodeId ? { wbsNodeId: filters.wbsNodeId } : {}),
    },
    include: {
      items: {
        orderBy: { itemNumber: "asc" },
      },
      wbsNode: {
        select: { id: true, code: true, name: true },
      },
      activity: {
        select: { id: true, code: true, name: true },
      },
      costItem: {
        select: { id: true, code: true, description: true },
      },
      _count: {
        select: {
          items: true,
          quotations: { where: { deletedAt: null } },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });
}

export async function getPurchaseRequestById(projectId: string, requestId: string) {
  return prisma.purchaseRequest.findFirst({
    where: { id: requestId, projectId, deletedAt: null },
    include: {
      items: {
        orderBy: { itemNumber: "asc" },
      },
      wbsNode: {
        select: { id: true, code: true, name: true },
      },
      activity: {
        select: { id: true, code: true, name: true },
      },
      costItem: {
        select: { id: true, code: true, description: true },
      },
      quotations: {
        where: { deletedAt: null },
        include: {
          supplier: true,
          items: true,
        },
        orderBy: { totalAmount: "asc" },
      },
      bidComparisons: {
        where: { deletedAt: null },
        include: {
          selectedQuotation: {
            include: { supplier: true },
          },
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Cotações (Quotation)
// ---------------------------------------------------------------------------

export async function listQuotations(
  projectId: string,
  filters?: { requestId?: string; supplierId?: string }
) {
  return prisma.quotation.findMany({
    where: {
      projectId,
      deletedAt: null,
      ...(filters?.requestId ? { requestId: filters.requestId } : {}),
      ...(filters?.supplierId ? { supplierId: filters.supplierId } : {}),
    },
    include: {
      supplier: true,
      request: {
        select: { id: true, code: true, title: true, status: true },
      },
      items: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getQuotationById(projectId: string, quotationId: string) {
  return prisma.quotation.findFirst({
    where: { id: quotationId, projectId, deletedAt: null },
    include: {
      supplier: true,
      request: {
        include: { items: true },
      },
      items: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Mapa Comparativo (BidComparison)
// ---------------------------------------------------------------------------

export async function getBidComparisonByRequestId(projectId: string, requestId: string) {
  return prisma.bidComparison.findFirst({
    where: { requestId, projectId, deletedAt: null },
    include: {
      selectedQuotation: {
        include: { supplier: true, items: true },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Pedido de Compra (PurchaseOrder)
// ---------------------------------------------------------------------------
export async function listPurchaseOrders(projectId: string, filters?: { status?: string }) {
  return prisma.purchaseOrder.findMany({
    where: { projectId, deletedAt: null, ...(filters?.status ? { status: filters.status as never } : {}) },
    include: { supplier: true, items: true, request: { select: { id: true, code: true, title: true } }, quotation: { select: { id: true, code: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPurchaseOrderById(projectId: string, orderId: string) {
  return prisma.purchaseOrder.findFirst({
    where: { id: orderId, projectId, deletedAt: null },
    include: { supplier: true, items: true, request: { include: { items: true } }, quotation: { include: { items: true, supplier: true } }, goodsReceipts: { include: { items: true } } },
  });
}

// ---------------------------------------------------------------------------
// Recebimento (GoodsReceipt)
// ---------------------------------------------------------------------------
export async function listGoodsReceipts(projectId: string, filters?: { purchaseOrderId?: string }) {
  return prisma.goodsReceipt.findMany({
    where: { projectId, deletedAt: null, ...(filters?.purchaseOrderId ? { purchaseOrderId: filters.purchaseOrderId } : {}) },
    include: { purchaseOrder: { select: { id: true, code: true } }, items: { include: { purchaseOrderItem: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getGoodsReceiptById(projectId: string, receiptId: string) {
  return prisma.goodsReceipt.findFirst({
    where: { id: receiptId, projectId, deletedAt: null },
    include: { purchaseOrder: { include: { items: true, supplier: true } }, items: { include: { purchaseOrderItem: true } } },
  });
}

// ---------------------------------------------------------------------------
// Quadro Geral de Suprimentos (Board Summary)
// ---------------------------------------------------------------------------

export async function getProcurementBoard(
  organizationId: string,
  projectId: string
): Promise<ProcurementBoardSummary> {
  const [requests, quotations, suppliers] = await Promise.all([
    prisma.purchaseRequest.findMany({
      where: { organizationId, projectId, deletedAt: null },
      select: { status: true, requiredDate: true },
    }),
    prisma.quotation.findMany({
      where: { organizationId, projectId, deletedAt: null },
      select: { status: true },
    }),
    prisma.supplier.findMany({
      where: { organizationId, deletedAt: null },
      select: { status: true },
    }),
  ]);

  return summarizeProcurementBoard(requests, quotations, suppliers);
}

