import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { z } from "zod";
import {
  createPurchaseRequestSchema,
  transitionPurchaseRequestSchema,
  updatePurchaseRequestSchema,
} from "@/modules/procurement/schemas";
import {
  ActorContext,
  assertFieldLinks,
  assertProcurementProject,
  audit,
  emitDomainEvent,
  nextProcurementCode,
  toDate,
} from "@/modules/procurement/common";
import {
  isPurchaseRequestEditable,
  nextPurchaseRequestStatus,
} from "@/modules/procurement/engine";

export async function createPurchaseRequest(
  projectId: string,
  input: z.input<typeof createPurchaseRequestSchema>,
  actor: ActorContext
) {
  await assertProcurementProject(actor.organizationId, projectId);
  const data = createPurchaseRequestSchema.parse(input);

  if (data.clientUuid) {
    const existing = await prisma.purchaseRequest.findFirst({
      where: {
        projectId,
        clientUuid: data.clientUuid,
        deletedAt: null,
      },
      include: {
        items: true,
      },
    });
    if (existing) return existing;
  }

  await assertFieldLinks(actor.organizationId, projectId, {
    wbsNodeId: data.wbsNodeId,
    activityId: data.activityId,
  });

  if (data.costItemId) {
    const costItem = await prisma.costItem.findFirst({
      where: { id: data.costItemId, projectId, deletedAt: null },
    });
    if (!costItem) {
      throw new AppError("VALIDATION_ERROR", "Item de custo informado não existe neste projeto.");
    }
  }

  const code = data.code ?? (await nextProcurementCode(projectId, "PR"));

  const existingCode = await prisma.purchaseRequest.findFirst({
    where: { projectId, code, deletedAt: null },
  });
  if (existingCode) {
    throw new AppError("CONFLICT", `Requisição de compra com código '${code}' já existe neste projeto.`);
  }

  const request = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseRequest.create({
      data: {
        organizationId: actor.organizationId,
        projectId,
        code,
        title: data.title,
        description: data.description ?? null,
        priority: data.priority,
        status: "DRAFT",
        requiredDate: toDate(data.requiredDate),
        wbsNodeId: data.wbsNodeId ?? null,
        activityId: data.activityId ?? null,
        costCenter: data.costCenter ?? null,
        costItemId: data.costItemId ?? null,
        clientUuid: data.clientUuid ?? null,
        createdBy: actor.actorId,
        updatedBy: actor.actorId,
        items: {
          create: data.items.map((item, index) => ({
            itemNumber: item.itemNumber ?? index + 1,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            estimatedUnitPrice: item.estimatedUnitPrice ?? null,
            estimatedTotalPrice:
              item.estimatedUnitPrice !== undefined
                ? Math.round(item.quantity * item.estimatedUnitPrice * 100) / 100
                : null,
            notes: item.notes ?? null,
          })),
        },
      },
      include: {
        items: true,
      },
    });
    return created;
  });

  await audit(actor, projectId, "PurchaseRequest", "CREATE", {
    objectId: request.id,
    newValue: request,
  });

  await emitDomainEvent(
    actor,
    projectId,
    "PurchaseRequest.Created",
    "PurchaseRequest",
    request.id,
    { code: request.code, title: request.title }
  );

  return request;
}

export async function updatePurchaseRequest(
  projectId: string,
  requestId: string,
  input: z.input<typeof updatePurchaseRequestSchema>,
  actor: ActorContext
) {
  await assertProcurementProject(actor.organizationId, projectId);
  const data = updatePurchaseRequestSchema.parse(input);

  const current = await prisma.purchaseRequest.findFirst({
    where: { id: requestId, projectId, deletedAt: null },
    include: { items: true },
  });
  if (!current) {
    throw new AppError("NOT_FOUND", "Requisição de compra não encontrada.");
  }

  if (!isPurchaseRequestEditable(current.status)) {
    throw new AppError(
      "PROCUREMENT_INVALID_STATE",
      `Requisição com status '${current.status}' não pode ser editada.`
    );
  }

  if (data.wbsNodeId || data.activityId) {
    await assertFieldLinks(actor.organizationId, projectId, {
      wbsNodeId: data.wbsNodeId ?? current.wbsNodeId,
      activityId: data.activityId ?? current.activityId,
    });
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (data.items && data.items.length > 0) {
      // Re-cria itens
      await tx.purchaseRequestItem.deleteMany({
        where: { requestId },
      });
      await tx.purchaseRequestItem.createMany({
        data: data.items.map((item, index) => ({
          requestId,
          itemNumber: item.itemNumber ?? index + 1,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          estimatedUnitPrice: item.estimatedUnitPrice ?? null,
          estimatedTotalPrice:
            item.estimatedUnitPrice !== undefined
              ? Math.round(item.quantity * item.estimatedUnitPrice * 100) / 100
              : null,
          notes: item.notes ?? null,
        })),
      });
    }

    return tx.purchaseRequest.update({
      where: { id: requestId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description || null } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(data.requiredDate !== undefined
          ? { requiredDate: data.requiredDate === null ? null : toDate(data.requiredDate) }
          : {}),
        ...(data.wbsNodeId !== undefined ? { wbsNodeId: data.wbsNodeId || null } : {}),
        ...(data.activityId !== undefined ? { activityId: data.activityId || null } : {}),
        ...(data.costCenter !== undefined ? { costCenter: data.costCenter || null } : {}),
        ...(data.costItemId !== undefined ? { costItemId: data.costItemId || null } : {}),
        updatedBy: actor.actorId,
        version: { increment: 1 },
      },
      include: {
        items: true,
      },
    });
  });

  await audit(actor, projectId, "PurchaseRequest", "UPDATE", {
    objectId: requestId,
    oldValue: current,
    newValue: updated,
  });

  return updated;
}

export async function transitionPurchaseRequestStatus(
  projectId: string,
  requestId: string,
  input: z.input<typeof transitionPurchaseRequestSchema>,
  actor: ActorContext
) {
  await assertProcurementProject(actor.organizationId, projectId);
  const data = transitionPurchaseRequestSchema.parse(input);

  const request = await prisma.purchaseRequest.findFirst({
    where: { id: requestId, projectId, deletedAt: null },
    include: {
      items: true,
      quotations: {
        where: { deletedAt: null },
      },
      bidComparisons: {
        where: { deletedAt: null, status: "COMPLETED" },
      },
    },
  });
  if (!request) {
    throw new AppError("NOT_FOUND", "Requisição de compra não encontrada.");
  }

  const result = nextPurchaseRequestStatus({
    currentStatus: request.status,
    action: data.action,
    itemCount: request.items.length,
    quotationCount: request.quotations.length,
    hasSelectedQuotation: request.bidComparisons.length > 0,
  });

  if ("error" in result) {
    throw new AppError("PROCUREMENT_INVALID_STATE", result.error);
  }

  const updated = await prisma.purchaseRequest.update({
    where: { id: requestId },
    data: {
      status: result.nextStatus,
      updatedBy: actor.actorId,
      version: { increment: 1 },
    },
    include: {
      items: true,
    },
  });

  await audit(actor, projectId, "PurchaseRequest", "STATUS_CHANGE", {
    objectId: requestId,
    oldValue: { status: request.status },
    newValue: { status: updated.status },
    reason: data.reason ?? null,
  });

  await emitDomainEvent(
    actor,
    projectId,
    "PurchaseRequest.StatusChanged",
    "PurchaseRequest",
    requestId,
    { fromStatus: request.status, toStatus: updated.status, action: data.action }
  );

  return updated;
}

export async function deletePurchaseRequest(
  projectId: string,
  requestId: string,
  actor: ActorContext
) {
  await assertProcurementProject(actor.organizationId, projectId);

  const request = await prisma.purchaseRequest.findFirst({
    where: { id: requestId, projectId, deletedAt: null },
    include: {
      quotations: {
        where: { deletedAt: null },
        take: 1,
      },
    },
  });
  if (!request) {
    throw new AppError("NOT_FOUND", "Requisição de compra não encontrada.");
  }

  if (request.status !== "DRAFT" && request.status !== "CANCELLED") {
    throw new AppError(
      "PROCUREMENT_INVALID_STATE",
      "Apenas requisições em Rascunho ou Canceladas podem ser excluídas."
    );
  }

  if (request.quotations.length > 0) {
    throw new AppError(
      "CONFLICT",
      "Não é possível excluir requisição que já possui cotações associadas."
    );
  }

  await prisma.purchaseRequest.update({
    where: { id: requestId },
    data: {
      deletedAt: new Date(),
      deletedBy: actor.actorId,
    },
  });

  await audit(actor, projectId, "PurchaseRequest", "DELETE", {
    objectId: requestId,
    oldValue: request,
  });

  return { success: true };
}
