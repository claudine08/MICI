import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { z } from "zod";
import {
  completeBidComparisonSchema,
  createOrUpdateBidComparisonSchema,
} from "@/modules/procurement/schemas";
import {
  ActorContext,
  assertProcurementProject,
  audit,
  emitDomainEvent,
  nextProcurementCode,
} from "@/modules/procurement/common";
import {
  analyzeBidComparison,
  QuotationComparisonEntry,
} from "@/modules/procurement/engine";

export async function createOrUpdateBidComparison(
  projectId: string,
  requestId: string,
  input: z.input<typeof createOrUpdateBidComparisonSchema>,
  actor: ActorContext
) {
  await assertProcurementProject(actor.organizationId, projectId);
  const data = createOrUpdateBidComparisonSchema.parse(input);

  const request = await prisma.purchaseRequest.findFirst({
    where: { id: requestId, projectId, deletedAt: null },
    include: {
      quotations: {
        where: { deletedAt: null },
        include: { supplier: true },
      },
    },
  });
  if (!request) {
    throw new AppError("NOT_FOUND", "Requisição de compra não encontrada.");
  }

  const quotationEntries: QuotationComparisonEntry[] = request.quotations.map((q) => ({
    quotationId: q.id,
    quotationCode: q.code,
    supplierId: q.supplierId,
    supplierName: q.supplier.name,
    totalAmount: Number(q.totalAmount),
    leadTimeDays: q.leadTimeDays,
    paymentTerms: q.paymentTerms,
    status: q.status,
  }));

  const analysis = analyzeBidComparison(quotationEntries);

  let existing = await prisma.bidComparison.findFirst({
    where: { requestId, projectId, deletedAt: null },
  });

  if (!existing) {
    const code = data.code ?? (await nextProcurementCode(projectId, "BC"));
    existing = await prisma.bidComparison.create({
      data: {
        organizationId: actor.organizationId,
        projectId,
        requestId,
        code,
        status: "DRAFT",
        selectedQuotationId: data.selectedQuotationId ?? analysis.lowestPriceQuotationId ?? null,
        selectionReason: data.selectionReason ?? null,
        comparisonData: analysis as never,
        clientUuid: data.clientUuid ?? null,
        createdBy: actor.actorId,
        updatedBy: actor.actorId,
      },
    });

    await audit(actor, projectId, "BidComparison", "CREATE", {
      objectId: existing.id,
      newValue: existing,
    });
  } else {
    existing = await prisma.bidComparison.update({
      where: { id: existing.id },
      data: {
        selectedQuotationId:
          data.selectedQuotationId !== undefined ? data.selectedQuotationId : existing.selectedQuotationId,
        selectionReason:
          data.selectionReason !== undefined ? data.selectionReason : existing.selectionReason,
        comparisonData: analysis as never,
        updatedBy: actor.actorId,
        version: { increment: 1 },
      },
    });

    await audit(actor, projectId, "BidComparison", "UPDATE", {
      objectId: existing.id,
      newValue: existing,
    });
  }

  return existing;
}

export async function completeBidComparison(
  projectId: string,
  requestId: string,
  input: z.input<typeof completeBidComparisonSchema>,
  actor: ActorContext
) {
  await assertProcurementProject(actor.organizationId, projectId);
  const data = completeBidComparisonSchema.parse(input);

  const request = await prisma.purchaseRequest.findFirst({
    where: { id: requestId, projectId, deletedAt: null },
    include: {
      quotations: {
        where: { deletedAt: null },
        include: { supplier: true },
      },
      bidComparisons: {
        where: { deletedAt: null },
      },
    },
  });
  if (!request) {
    throw new AppError("NOT_FOUND", "Requisição de compra não encontrada.");
  }

  const selectedQuotation = request.quotations.find((q) => q.id === data.selectedQuotationId);
  if (!selectedQuotation) {
    throw new AppError("VALIDATION_ERROR", "A cotação selecionada não pertence a esta requisição de compra.");
  }

  const quotationEntries: QuotationComparisonEntry[] = request.quotations.map((q) => ({
    quotationId: q.id,
    quotationCode: q.code,
    supplierId: q.supplierId,
    supplierName: q.supplier.name,
    totalAmount: Number(q.totalAmount),
    leadTimeDays: q.leadTimeDays,
    paymentTerms: q.paymentTerms,
    status: q.status,
  }));
  const analysis = analyzeBidComparison(quotationEntries);

  const result = await prisma.$transaction(async (tx) => {
    // 1. Atualiza a cotação selecionada para SELECTED
    await tx.quotation.update({
      where: { id: data.selectedQuotationId },
      data: {
        status: "SELECTED",
        updatedBy: actor.actorId,
      },
    });

    // 2. Desqualifica as outras cotações que estavam SUBMITTED
    const otherQuotationIds = request.quotations
      .filter((q) => q.id !== data.selectedQuotationId && (q.status === "SUBMITTED" || q.status === "DRAFT"))
      .map((q) => q.id);

    if (otherQuotationIds.length > 0) {
      await tx.quotation.updateMany({
        where: { id: { in: otherQuotationIds } },
        data: {
          status: "REJECTED",
          updatedBy: actor.actorId,
        },
      });
    }

    // 3. Atualiza ou cria o BidComparison com COMPLETED
    let comparison = request.bidComparisons[0];
    if (comparison) {
      comparison = await tx.bidComparison.update({
        where: { id: comparison.id },
        data: {
          status: "COMPLETED",
          selectedQuotationId: data.selectedQuotationId,
          selectionReason: data.selectionReason,
          comparisonData: analysis as never,
          completedAt: new Date(),
          completedById: actor.actorId,
          updatedBy: actor.actorId,
          version: { increment: 1 },
        },
      });
    } else {
      const code = await nextProcurementCode(projectId, "BC");
      comparison = await tx.bidComparison.create({
        data: {
          organizationId: actor.organizationId,
          projectId,
          requestId,
          code,
          status: "COMPLETED",
          selectedQuotationId: data.selectedQuotationId,
          selectionReason: data.selectionReason,
          comparisonData: analysis as never,
          completedAt: new Date(),
          completedById: actor.actorId,
          createdBy: actor.actorId,
          updatedBy: actor.actorId,
        },
      });
    }

    // 4. Atualiza a requisição de compra para COMPARED
    await tx.purchaseRequest.update({
      where: { id: requestId },
      data: {
        status: "COMPARED",
        updatedBy: actor.actorId,
      },
    });

    return comparison;
  });

  await audit(actor, projectId, "BidComparison", "COMPLETE", {
    objectId: result.id,
    newValue: result,
    reason: data.selectionReason,
  });

  await emitDomainEvent(
    actor,
    projectId,
    "BidComparison.Completed",
    "BidComparison",
    result.id,
    { requestId, selectedQuotationId: data.selectedQuotationId }
  );

  return result;
}

