import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { z } from "zod";
import { createGoodsReceiptSchema } from "@/modules/procurement/schemas";
import {
  ActorContext,
  assertProcurementProject,
  audit,
  emitDomainEvent,
  nextProcurementCode,
  toDate,
} from "@/modules/procurement/common";

export async function createGoodsReceipt(
  projectId: string,
  input: z.input<typeof createGoodsReceiptSchema>,
  actor: ActorContext
) {
  await assertProcurementProject(actor.organizationId, projectId);
  const data = createGoodsReceiptSchema.parse(input);

  if (data.clientUuid) {
    const existing = await prisma.goodsReceipt.findFirst({
      where: { projectId, clientUuid: data.clientUuid, deletedAt: null },
      include: { items: true },
    });
    if (existing) return existing;
  }

  const order = await prisma.purchaseOrder.findFirst({
    where: { id: data.purchaseOrderId, projectId, deletedAt: null },
    include: { items: true },
  });
  if (!order) throw new AppError("NOT_FOUND", "Pedido de compra não encontrado.");
  if (order.status !== "ISSUED" && order.status !== "PARTIALLY_RECEIVED") {
    throw new AppError(
      "PROCUREMENT_INVALID_STATE",
      `Recebimento só é permitido para pedido Emitido ou Parcialmente recebido (atual: ${order.status}).`
    );
  }

  // Valida itens contra o pedido
  const orderItemMap = new Map(order.items.map((it) => [it.id, it]));
  for (const it of data.items) {
    const poItem = orderItemMap.get(it.purchaseOrderItemId);
    if (!poItem) throw new AppError("VALIDATION_ERROR", "Item informado não pertence ao pedido de compra.");
    const alreadyReceived = Number(poItem.receivedQuantity);
    const remaining = Number(poItem.quantity) - alreadyReceived;
    if (it.quantityReceived > remaining + 1e-9) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Quantidade recebida (${it.quantityReceived}) excede o saldo do item (${remaining}).`
      );
    }
  }

  const code = data.code ?? (await nextProcurementCode(projectId, "GR"));

  const existingCode = await prisma.goodsReceipt.findFirst({ where: { projectId, code, deletedAt: null } });
  if (existingCode) throw new AppError("CONFLICT", `Recebimento com código '${code}' já existe neste projeto.`);

  const receipt = await prisma.$transaction(async (tx) => {
    const created = await tx.goodsReceipt.create({
      data: {
        organizationId: actor.organizationId,
        projectId,
        purchaseOrderId: data.purchaseOrderId,
        code,
        status: "DRAFT",
        receiptDate: toDate(data.receiptDate) ?? new Date(),
        notes: data.notes ?? null,
        clientUuid: data.clientUuid ?? null,
        createdBy: actor.actorId,
        updatedBy: actor.actorId,
        items: {
          create: data.items.map((it) => ({
            purchaseOrderItemId: it.purchaseOrderItemId,
            quantityReceived: it.quantityReceived,
            quantityRejected: it.quantityRejected ?? 0,
            notes: it.notes ?? null,
          })),
        },
      },
      include: { items: true },
    });
    return created;
  });

  await audit(actor, projectId, "GoodsReceipt", "CREATE", { objectId: receipt.id, newValue: receipt });
  await emitDomainEvent(actor, projectId, "GoodsReceipt.Created", "GoodsReceipt", receipt.id, {
    code: receipt.code, purchaseOrderId: data.purchaseOrderId,
  });

  return receipt;
}

export async function confirmGoodsReceipt(
  projectId: string,
  receiptId: string,
  actor: ActorContext
) {
  await assertProcurementProject(actor.organizationId, projectId);

  const receipt = await prisma.goodsReceipt.findFirst({
    where: { id: receiptId, projectId, deletedAt: null },
    include: { items: true, purchaseOrder: { include: { items: true } } },
  });
  if (!receipt) throw new AppError("NOT_FOUND", "Recebimento não encontrado.");
  if (receipt.status !== "DRAFT") {
    throw new AppError("PROCUREMENT_INVALID_STATE", "Apenas recebimentos em rascunho podem ser confirmados.");
  }

  await prisma.$transaction(async (tx) => {
    // Atualiza receivedQuantity nos itens do pedido
    for (const gri of receipt.items) {
      await tx.purchaseOrderItem.update({
        where: { id: gri.purchaseOrderItemId },
        data: { receivedQuantity: { increment: gri.quantityReceived } },
      });
    }
    await tx.goodsReceipt.update({
      where: { id: receiptId },
      data: { status: "CONFIRMED", updatedBy: actor.actorId, version: { increment: 1 } },
    });
  });

  // Atualiza status do pedido (PARTIALLY/FULLY_RECEIVED)
  await transitionPurchaseOrderStatusAfterReceipt(projectId, receipt.purchaseOrderId, actor);

  await audit(actor, projectId, "GoodsReceipt", "CONFIRM", { objectId: receiptId, newValue: { status: "CONFIRMED" } });
  await emitDomainEvent(actor, projectId, "GoodsReceipt.Confirmed", "GoodsReceipt", receiptId, {});

  const updated = await prisma.goodsReceipt.findFirst({ where: { id: receiptId, projectId, deletedAt: null }, include: { items: true } });
  return updated;
}

async function transitionPurchaseOrderStatusAfterReceipt(projectId: string, orderId: string, actor: ActorContext) {
  const order = await prisma.purchaseOrder.findFirst({
    where: { id: orderId, projectId, deletedAt: null },
    include: { items: true, goodsReceipts: { where: { status: "CONFIRMED" }, include: { items: true } } },
  });
  if (!order) return;

  const receivedByItem = new Map<string, number>();
  for (const gr of order.goodsReceipts) {
    for (const gri of gr.items) {
      receivedByItem.set(gri.purchaseOrderItemId, (receivedByItem.get(gri.purchaseOrderItemId) ?? 0) + Number(gri.quantityReceived));
    }
  }
  const fullyReceived = order.items.length > 0 && order.items.every((it) => (receivedByItem.get(it.id) ?? 0) >= Number(it.quantity) - 1e-9);

  const newStatus = fullyReceived ? "FULLY_RECEIVED" : "PARTIALLY_RECEIVED";
  if (order.status === "ISSUED" || order.status === "PARTIALLY_RECEIVED") {
    await prisma.purchaseOrder.update({
      where: { id: orderId },
      data: { status: newStatus as never, updatedBy: actor.actorId, version: { increment: 1 } },
    });
  }
}

export async function deleteGoodsReceipt(projectId: string, receiptId: string, actor: ActorContext) {
  await assertProcurementProject(actor.organizationId, projectId);
  const receipt = await prisma.goodsReceipt.findFirst({ where: { id: receiptId, projectId, deletedAt: null } });
  if (!receipt) throw new AppError("NOT_FOUND", "Recebimento não encontrado.");
  if (receipt.status !== "DRAFT") {
    throw new AppError("PROCUREMENT_INVALID_STATE", "Apenas recebimentos em rascunho podem ser excluídos.");
  }
  await prisma.goodsReceipt.update({ where: { id: receiptId }, data: { deletedAt: new Date(), deletedBy: actor.actorId } });
  await audit(actor, projectId, "GoodsReceipt", "DELETE", { objectId: receiptId, oldValue: receipt });
  return { success: true };
}