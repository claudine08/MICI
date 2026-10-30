import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { z } from "zod";
import {
  createQuotationSchema,
  transitionQuotationSchema,
  updateQuotationSchema,
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
  calculateQuotationTotals,
  isQuotationEditable,
  isSupplierActive,
  nextQuotationStatus,
} from "@/modules/procurement/engine";

export async function createQuotation(
  projectId: string,
  input: z.input<typeof createQuotationSchema>,
  actor: ActorContext
) {
  await assertProcurementProject(actor.organizationId, projectId);
  const data = createQuotationSchema.parse(input);

  if (data.clientUuid) {
    const existing = await prisma.quotation.findFirst({
      where: {
        projectId,
        clientUuid: data.clientUuid,
        deletedAt: null,
      },
      include: {
        items: true,
        supplier: true,
      },
    });
    if (existing) return existing;
  }

  // Valida requisição de compra
  const request = await prisma.purchaseRequest.findFirst({
    where: { id: data.requestId, projectId, deletedAt: null },
    include: { items: true },
  });
  if (!request) {
    throw new AppError("NOT_FOUND", "Requisição de compra informada não encontrada.");
  }
  if (request.status === "CANCELLED" || request.status === "REJECTED" || request.status === "APPROVED") {
    throw new AppError(
      "PROCUREMENT_INVALID_STATE",
      `Não é possível adicionar cotação a uma requisição com status '${request.status}'.`
    );
  }

  // Valida fornecedor
  const supplier = await prisma.supplier.findFirst({
    where: { id: data.supplierId, organizationId: actor.organizationId, deletedAt: null },
  });
  if (!supplier) {
    throw new AppError("NOT_FOUND", "Fornecedor informado não encontrado.");
  }
  if (!isSupplierActive(supplier.status)) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Fornecedor '${supplier.name}' está com status '${supplier.status}' e não pode receber cotações.`
    );
  }

  const code = data.code ?? (await nextProcurementCode(projectId, "QT"));

  const totals = calculateQuotationTotals(
    data.items.map((it) => ({ quantity: it.quantity, unitPrice: it.unitPrice })),
    data.shippingCost,
    data.discount
  );

  const quotation = await prisma.$transaction(async (tx) => {
    const created = await tx.quotation.create({
      data: {
        organizationId: actor.organizationId,
        projectId,
        requestId: data.requestId,
        supplierId: data.supplierId,
        code,
        status: "DRAFT",
        quotationDate: toDate(data.quotationDate) ?? new Date(),
        validUntil: toDate(data.validUntil),
        leadTimeDays: data.leadTimeDays ?? null,
        paymentTerms: data.paymentTerms ?? null,
        shippingTerms: data.shippingTerms ?? null,
        shippingCost: data.shippingCost,
        discount: data.discount,
        totalAmount: totals.totalAmount,
        notes: data.notes ?? null,
        clientUuid: data.clientUuid ?? null,
        createdBy: actor.actorId,
        updatedBy: actor.actorId,
        items: {
          create: data.items.map((item) => ({
            requestItemId: item.requestItemId ?? null,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            totalPrice: Math.round(item.quantity * item.unitPrice * 100) / 100,
            leadTimeDays: item.leadTimeDays ?? null,
            brand: item.brand ?? null,
            notes: item.notes ?? null,
          })),
        },
      },
      include: {
        items: true,
        supplier: true,
      },
    });

    // Se a requisição estava apenas SUBMITTED, avança automaticamente para QUOTING
    if (request.status === "SUBMITTED") {
      await tx.purchaseRequest.update({
        where: { id: request.id },
        data: {
          status: "QUOTING",
          updatedBy: actor.actorId,
        },
      });
    }

    return created;
  });

  await audit(actor, projectId, "Quotation", "CREATE", {
    objectId: quotation.id,
    newValue: quotation,
  });

  await emitDomainEvent(
    actor,
    projectId,
    "Quotation.Created",
    "Quotation",
    quotation.id,
    { code: quotation.code, requestId: data.requestId, supplierId: data.supplierId }
  );

  return quotation;
}

export async function updateQuotation(
  projectId: string,
  quotationId: string,
  input: z.input<typeof updateQuotationSchema>,
  actor: ActorContext
) {
  await assertProcurementProject(actor.organizationId, projectId);
  const data = updateQuotationSchema.parse(input);

  const current = await prisma.quotation.findFirst({
    where: { id: quotationId, projectId, deletedAt: null },
    include: { items: true },
  });
  if (!current) {
    throw new AppError("NOT_FOUND", "Cotação não encontrada.");
  }

  if (!isQuotationEditable(current.status)) {
    throw new AppError(
      "PROCUREMENT_INVALID_STATE",
      `Cotação com status '${current.status}' não pode ser editada.`
    );
  }

  if (data.supplierId && data.supplierId !== current.supplierId) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: data.supplierId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!supplier) throw new AppError("NOT_FOUND", "Fornecedor não encontrado.");
  }

  const shippingCost = data.shippingCost !== undefined ? data.shippingCost : Number(current.shippingCost);
  const discount = data.discount !== undefined ? data.discount : Number(current.discount);

  const itemsToCalc = data.items
    ? data.items.map((it) => ({ quantity: it.quantity, unitPrice: it.unitPrice }))
    : current.items.map((it) => ({ quantity: Number(it.quantity), unitPrice: Number(it.unitPrice) }));

  const totals = calculateQuotationTotals(itemsToCalc, shippingCost, discount);

  const updated = await prisma.$transaction(async (tx) => {
    if (data.items && data.items.length > 0) {
      await tx.quotationItem.deleteMany({
        where: { quotationId },
      });
      await tx.quotationItem.createMany({
        data: data.items.map((item) => ({
          quotationId,
          requestItemId: item.requestItemId ?? null,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          totalPrice: Math.round(item.quantity * item.unitPrice * 100) / 100,
          leadTimeDays: item.leadTimeDays ?? null,
          brand: item.brand ?? null,
          notes: item.notes ?? null,
        })),
      });
    }

    return tx.quotation.update({
      where: { id: quotationId },
      data: {
        ...(data.supplierId !== undefined ? { supplierId: data.supplierId } : {}),
        ...(data.quotationDate !== undefined ? { quotationDate: toDate(data.quotationDate) ?? new Date() } : {}),
        ...(data.validUntil !== undefined
          ? { validUntil: data.validUntil === null ? null : toDate(data.validUntil) }
          : {}),
        ...(data.leadTimeDays !== undefined ? { leadTimeDays: data.leadTimeDays ?? null } : {}),
        ...(data.paymentTerms !== undefined ? { paymentTerms: data.paymentTerms || null } : {}),
        ...(data.shippingTerms !== undefined ? { shippingTerms: data.shippingTerms || null } : {}),
        ...(data.shippingCost !== undefined ? { shippingCost: data.shippingCost } : {}),
        ...(data.discount !== undefined ? { discount: data.discount } : {}),
        totalAmount: totals.totalAmount,
        ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
        updatedBy: actor.actorId,
        version: { increment: 1 },
      },
      include: {
        items: true,
        supplier: true,
      },
    });
  });

  await audit(actor, projectId, "Quotation", "UPDATE", {
    objectId: quotationId,
    oldValue: current,
    newValue: updated,
  });

  return updated;
}

export async function transitionQuotationStatus(
  projectId: string,
  quotationId: string,
  input: z.input<typeof transitionQuotationSchema>,
  actor: ActorContext
) {
  await assertProcurementProject(actor.organizationId, projectId);
  const data = transitionQuotationSchema.parse(input);

  const quotation = await prisma.quotation.findFirst({
    where: { id: quotationId, projectId, deletedAt: null },
    include: { items: true },
  });
  if (!quotation) {
    throw new AppError("NOT_FOUND", "Cotação não encontrada.");
  }

  const result = nextQuotationStatus(quotation.status, data.action, quotation.items.length);
  if ("error" in result) {
    throw new AppError("PROCUREMENT_INVALID_STATE", result.error);
  }

  const updated = await prisma.quotation.update({
    where: { id: quotationId },
    data: {
      status: result.nextStatus,
      updatedBy: actor.actorId,
      version: { increment: 1 },
    },
    include: {
      items: true,
      supplier: true,
    },
  });

  await audit(actor, projectId, "Quotation", "STATUS_CHANGE", {
    objectId: quotationId,
    oldValue: { status: quotation.status },
    newValue: { status: updated.status },
    reason: data.reason ?? null,
  });

  return updated;
}

export async function deleteQuotation(
  projectId: string,
  quotationId: string,
  actor: ActorContext
) {
  await assertProcurementProject(actor.organizationId, projectId);

  const quotation = await prisma.quotation.findFirst({
    where: { id: quotationId, projectId, deletedAt: null },
  });
  if (!quotation) {
    throw new AppError("NOT_FOUND", "Cotação não encontrada.");
  }

  if (quotation.status !== "DRAFT" && quotation.status !== "CANCELLED") {
    throw new AppError(
      "PROCUREMENT_INVALID_STATE",
      "Apenas cotações em Rascunho ou Canceladas podem ser excluídas."
    );
  }

  await prisma.quotation.update({
    where: { id: quotationId },
    data: {
      deletedAt: new Date(),
      deletedBy: actor.actorId,
    },
  });

  await audit(actor, projectId, "Quotation", "DELETE", {
    objectId: quotationId,
    oldValue: quotation,
  });

  return { success: true };
}

