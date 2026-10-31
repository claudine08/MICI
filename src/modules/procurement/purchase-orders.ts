import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { z } from "zod";
import {
  createPurchaseOrderSchema,
  transitionPurchaseOrderSchema,
  updatePurchaseOrderSchema,
} from "@/modules/procurement/schemas";
import {
  ActorContext,
  assertProcurementProject,
  audit,
  emitDomainEvent,
  nextProcurementCode,
  toDate,
} from "@/modules/procurement/common";
import {
  isPurchaseOrderEditable,
  nextPurchaseOrderStatus,
} from "@/modules/procurement/engine";

export async function createPurchaseOrder(
  projectId: string,
  input: z.input<typeof createPurchaseOrderSchema>,
  actor: ActorContext
) {
  await assertProcurementProject(actor.organizationId, projectId);
  const data = createPurchaseOrderSchema.parse(input);

  if (data.clientUuid) {
    const existing = await prisma.purchaseOrder.findFirst({
      where: { projectId, clientUuid: data.clientUuid, deletedAt: null },
      include: { items: true },
    });
    if (existing) return existing;
  }

  // Valida requisição (deve estar APPROVED)
  const request = await prisma.purchaseRequest.findFirst({
    where: { id: data.requestId, projectId, deletedAt: null },
    include: { items: true },
  });
  if (!request) throw new AppError("NOT_FOUND", "Requisição de compra não encontrada.");
  if (request.status !== "APPROVED") {
    throw new AppError(
      "PROCUREMENT_INVALID_STATE",
      `Pedido de compra só pode ser emitido a partir de requisição Aprovada (atual: ${request.status}).`
    );
  }

  // Valida fornecedor
  const supplier = await prisma.supplier.findFirst({
    where: { id: data.supplierId, organizationId: actor.organizationId, deletedAt: null },
  });
  if (!supplier) throw new AppError("NOT_FOUND", "Fornecedor não encontrado.");

  // Valida cotação (opcional, mas se informada deve ser SELECTED e da requisição)
  let quotation = null;
  if (data.quotationId) {
    quotation = await prisma.quotation.findFirst({
      where: { id: data.quotationId, projectId, deletedAt: null },
      include: { items: true },
    });
    if (!quotation) throw new AppError("NOT_FOUND", "Cotação informada não encontrada.");
    if (quotation.requestId !== data.requestId) {
      throw new AppError("VALIDATION_ERROR", "A cotação não pertence a esta requisição.");
    }
  }

  const code = data.code ?? (await nextProcurementCode(projectId, "PO"));

  const existingCode = await prisma.purchaseOrder.findFirst({ where: { projectId, code, deletedAt: null } });
  if (existingCode) throw new AppError("CONFLICT", `Pedido de compra com código '${code}' já existe neste projeto.`);

  // Itens: se não informados, deriva da cotação selecionada ou da requisição
  const itemsInput = data.items && data.items.length > 0
    ? data.items
    : quotation
      ? quotation.items.map((qi) => ({
          description: qi.description,
          quantity: Number(qi.quantity),
          unit: qi.unit,
          unitPrice: Number(qi.unitPrice),
          requestItemId: qi.requestItemId ?? undefined,
          quotationItemId: qi.id,
        }))
      : request.items.map((ri) => ({
          description: ri.description,
          quantity: Number(ri.quantity),
          unit: ri.unit,
          unitPrice: ri.estimatedUnitPrice ? Number(ri.estimatedUnitPrice) : 0,
          requestItemId: ri.id,
        }));

  if (itemsInput.length === 0) {
    throw new AppError("VALIDATION_ERROR", "O pedido de compra deve conter ao menos 1 item.");
  }

  const totals = itemsInput.reduce((acc, it) => acc + it.quantity * it.unitPrice, 0);
  const totalAmount = Math.max(0, totals + (data.shippingCost ?? 0) - (data.discount ?? 0));

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseOrder.create({
      data: {
        organizationId: actor.organizationId,
        projectId,
        requestId: data.requestId,
        quotationId: data.quotationId ?? null,
        supplierId: data.supplierId,
        code,
        status: "DRAFT",
        issueDate: toDate(data.issueDate),
        expectedDeliveryDate: toDate(data.expectedDeliveryDate),
        paymentTerms: data.paymentTerms ?? null,
        shippingTerms: data.shippingTerms ?? null,
        shippingCost: data.shippingCost ?? 0,
        discount: data.discount ?? 0,
        totalAmount: Math.round(totalAmount * 100) / 100,
        notes: data.notes ?? null,
        clientUuid: data.clientUuid ?? null,
        createdBy: actor.actorId,
        updatedBy: actor.actorId,
        wbsNodeId: data.wbsNodeId ?? request.wbsNodeId ?? null,
        activityId: data.activityId ?? request.activityId ?? null,
        costItemId: data.costItemId ?? request.costItemId ?? null,
        items: {
          create: itemsInput.map((it) => ({
            description: it.description,
            quantity: it.quantity,
            unit: it.unit,
            unitPrice: it.unitPrice,
            totalPrice: Math.round(it.quantity * it.unitPrice * 100) / 100,
            requestItemId: it.requestItemId ?? null,
            quotationItemId: (it as { quotationItemId?: string }).quotationItemId ?? null,
          })),
        },
      },
      include: { items: true },
    });
    return created;
  });

  await audit(actor, projectId, "PurchaseOrder", "CREATE", { objectId: order.id, newValue: order });
  await emitDomainEvent(actor, projectId, "PurchaseOrder.Created", "PurchaseOrder", order.id, {
    code: order.code, requestId: data.requestId, supplierId: data.supplierId,
  });

  return order;
}

export async function updatePurchaseOrder(
  projectId: string,
  orderId: string,
  input: z.input<typeof updatePurchaseOrderSchema>,
  actor: ActorContext
) {
  await assertProcurementProject(actor.organizationId, projectId);
  const data = updatePurchaseOrderSchema.parse(input);

  const current = await prisma.purchaseOrder.findFirst({
    where: { id: orderId, projectId, deletedAt: null },
    include: { items: true },
  });
  if (!current) throw new AppError("NOT_FOUND", "Pedido de compra não encontrado.");
  if (!isPurchaseOrderEditable(current.status)) {
    throw new AppError("PROCUREMENT_INVALID_STATE", `Pedido com status '${current.status}' não pode ser editado.`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (data.items && data.items.length > 0) {
      await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: orderId } });
      await tx.purchaseOrderItem.createMany({
        data: data.items.map((it) => ({
          purchaseOrderId: orderId,
          description: it.description,
          quantity: it.quantity,
          unit: it.unit,
          unitPrice: it.unitPrice,
          totalPrice: Math.round(it.quantity * it.unitPrice * 100) / 100,
          requestItemId: it.requestItemId ?? null,
          quotationItemId: it.quotationItemId ?? null,
        })),
      });
    }

    const itemsToCalc = data.items
      ? data.items.map((it) => ({ quantity: it.quantity, unitPrice: it.unitPrice }))
      : current.items.map((it) => ({ quantity: Number(it.quantity), unitPrice: Number(it.unitPrice) }));

    const shippingCost = data.shippingCost !== undefined ? data.shippingCost : Number(current.shippingCost);
    const discount = data.discount !== undefined ? data.discount : Number(current.discount);
    const totals = itemsToCalc.reduce((acc, it) => acc + it.quantity * it.unitPrice, 0);
    const totalAmount = Math.max(0, totals + shippingCost - discount);

    return tx.purchaseOrder.update({
      where: { id: orderId },
      data: {
        ...(data.supplierId !== undefined ? { supplierId: data.supplierId } : {}),
        ...(data.issueDate !== undefined ? { issueDate: toDate(data.issueDate ?? undefined) } : {}),
        ...(data.expectedDeliveryDate !== undefined ? { expectedDeliveryDate: data.expectedDeliveryDate === null ? null : toDate(data.expectedDeliveryDate) } : {}),
        ...(data.paymentTerms !== undefined ? { paymentTerms: data.paymentTerms || null } : {}),
        ...(data.shippingTerms !== undefined ? { shippingTerms: data.shippingTerms || null } : {}),
        ...(data.shippingCost !== undefined ? { shippingCost: data.shippingCost } : {}),
        ...(data.discount !== undefined ? { discount: data.discount } : {}),
        totalAmount: Math.round(totalAmount * 100) / 100,
        ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
        updatedBy: actor.actorId,
        version: { increment: 1 },
      },
      include: { items: true },
    });
  });

  await audit(actor, projectId, "PurchaseOrder", "UPDATE", { objectId: orderId, oldValue: current, newValue: updated });
  return updated;
}

export async function transitionPurchaseOrderStatus(
  projectId: string,
  orderId: string,
  input: z.input<typeof transitionPurchaseOrderSchema>,
  actor: ActorContext
) {
  await assertProcurementProject(actor.organizationId, projectId);
  const data = transitionPurchaseOrderSchema.parse(input);

  const order = await prisma.purchaseOrder.findFirst({
    where: { id: orderId, projectId, deletedAt: null },
    include: { items: true, goodsReceipts: { include: { items: true } } },
  });
  if (!order) throw new AppError("NOT_FOUND", "Pedido de compra não encontrado.");

  // Calcula se totalmente recebido
  const receivedByItem = new Map<string, number>();
  for (const gr of order.goodsReceipts) {
    if (gr.status !== "CONFIRMED") continue;
    for (const gri of gr.items) {
      receivedByItem.set(gri.purchaseOrderItemId, (receivedByItem.get(gri.purchaseOrderItemId) ?? 0) + Number(gri.quantityReceived));
    }
  }
  const fullyReceived = order.items.length > 0 && order.items.every((it) => (receivedByItem.get(it.id) ?? 0) >= Number(it.quantity));

  const result = nextPurchaseOrderStatus({
    currentStatus: order.status,
    action: data.action,
    fullyReceived,
  });
  if ("error" in result) throw new AppError("PROCUREMENT_INVALID_STATE", result.error);

  const updated = await prisma.purchaseOrder.update({
    where: { id: orderId },
    data: { status: result.nextStatus, updatedBy: actor.actorId, version: { increment: 1 } },
    include: { items: true },
  });

  await audit(actor, projectId, "PurchaseOrder", "STATUS_CHANGE", {
    objectId: orderId, oldValue: { status: order.status }, newValue: { status: updated.status }, reason: data.reason ?? null,
  });
  await emitDomainEvent(actor, projectId, "PurchaseOrder.StatusChanged", "PurchaseOrder", orderId, {
    fromStatus: order.status, toStatus: updated.status, action: data.action,
  });

  return updated;
}

export async function deletePurchaseOrder(projectId: string, orderId: string, actor: ActorContext) {
  await assertProcurementProject(actor.organizationId, projectId);
  const order = await prisma.purchaseOrder.findFirst({ where: { id: orderId, projectId, deletedAt: null } });
  if (!order) throw new AppError("NOT_FOUND", "Pedido de compra não encontrado.");
  if (order.status !== "DRAFT" && order.status !== "CANCELLED") {
    throw new AppError("PROCUREMENT_INVALID_STATE", "Apenas pedidos em Rascunho ou Cancelados podem ser excluídos.");
  }
  await prisma.purchaseOrder.update({ where: { id: orderId }, data: { deletedAt: new Date(), deletedBy: actor.actorId } });
  await audit(actor, projectId, "PurchaseOrder", "DELETE", { objectId: orderId, oldValue: order });
  return { success: true };
}