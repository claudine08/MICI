import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { enqueueJob } from "@/modules/integrations/jobs";
import { assertProcurementProject, audit, emitDomainEvent, nextProcurementCode } from "@/modules/procurement/common";

interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

async function nextCode(projectId: string): Promise<string> {
  const rows = await prisma.supplierRfi.findMany({ where: { projectId }, select: { code: true } });
  let max = 0;
  for (const { code } of rows) {
    const m = /^RFQ(\d+)$/.exec(code);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `RFQ${String(max + 1).padStart(3, "0")}`;
}

export async function createSupplierRfi(
  input: ActorContext & {
    projectId: string;
    title: string;
    description?: string | null;
    dueDate?: string | null;
    wbsNodeId?: string | null;
    activityId?: string | null;
    supplierIds?: string[];
  }
) {
  const code = await nextCode(input.projectId);
  const rfi = await prisma.supplierRfi.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      code,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00.000Z`) : null,
      wbsNodeId: input.wbsNodeId ?? null,
      activityId: input.activityId ?? null,
      createdBy: input.actorId,
      updatedBy: input.actorId,
      ...(input.supplierIds && input.supplierIds.length
        ? { recipients: { create: input.supplierIds.map((sid) => ({ organizationId: input.organizationId, supplierId: sid, responseToken: randomBytes(32).toString("hex") })) } }
        : {}),
    },
  });
  return rfi;
}

export async function addRecipient(input: ActorContext & { rfiId: string; supplierId: string }) {
  const rfi = await prisma.supplierRfi.findFirst({ where: { id: input.rfiId, organizationId: input.organizationId, deletedAt: null } });
  if (!rfi) throw new AppError("NOT_FOUND", "RFI não encontrado.");
  const existing = await prisma.supplierRfiRecipient.findUnique({ where: { rfiId_supplierId: { rfiId: rfi.id, supplierId: input.supplierId } } });
  if (existing) return existing;
  return prisma.supplierRfiRecipient.create({ data: { organizationId: input.organizationId, rfiId: rfi.id, supplierId: input.supplierId, responseToken: randomBytes(32).toString("hex") } });
}

export async function removeRecipient(input: ActorContext & { rfiId: string; supplierId: string }) {
  const rfi = await prisma.supplierRfi.findFirst({ where: { id: input.rfiId, organizationId: input.organizationId, deletedAt: null } });
  if (!rfi) throw new AppError("NOT_FOUND", "RFI não encontrado.");
  await prisma.supplierRfiRecipient.deleteMany({ where: { rfiId: rfi.id, supplierId: input.supplierId } });
  return { rfiId: rfi.id, supplierId: input.supplierId };
}

export async function recordResponse(input: ActorContext & { rfiId: string; supplierId: string; quotedAmount?: number; leadTimeDays?: number; notes?: string | null }) {
  const rfi = await prisma.supplierRfi.findFirst({ where: { id: input.rfiId, organizationId: input.organizationId, deletedAt: null } });
  if (!rfi) throw new AppError("NOT_FOUND", "RFI não encontrado.");
  const recipient = await prisma.supplierRfiRecipient.findUnique({ where: { rfiId_supplierId: { rfiId: rfi.id, supplierId: input.supplierId } } });
  if (!recipient) throw new AppError("NOT_FOUND", "Fornecedor não é destinatário deste RFI.");
  const updated = await prisma.supplierRfiRecipient.update({
    where: { id: recipient.id },
    data: {
      status: "RESPONDED",
      quotedAmount: input.quotedAmount !== undefined ? input.quotedAmount : recipient.quotedAmount,
      leadTimeDays: input.leadTimeDays !== undefined ? input.leadTimeDays : recipient.leadTimeDays,
      notes: input.notes !== undefined ? input.notes : recipient.notes,
      respondedAt: new Date(),
      updatedBy: input.actorId,
    },
  });
  // update RFI status to RESPONDED if any response
  await prisma.supplierRfi.update({ where: { id: rfi.id }, data: { status: "RESPONDED", updatedBy: input.actorId } });
  return updated;
}

export async function selectSupplier(input: ActorContext & { rfiId: string; supplierId: string }) {
  const rfi = await prisma.supplierRfi.findFirst({ where: { id: input.rfiId, organizationId: input.organizationId, deletedAt: null } });
  if (!rfi) throw new AppError("NOT_FOUND", "RFI não encontrado.");
  const recipient = await prisma.supplierRfiRecipient.findUnique({ where: { rfiId_supplierId: { rfiId: rfi.id, supplierId: input.supplierId } } });
  if (!recipient) throw new AppError("VALIDATION_ERROR", "Fornecedor não é destinatário deste RFI.");
  if (recipient.status !== "RESPONDED") throw new AppError("VALIDATION_ERROR", "Apenas fornecedores que responderam podem ser selecionados.");
  const updated = await prisma.supplierRfi.update({
    where: { id: rfi.id },
    data: { selectedSupplierId: input.supplierId, status: "SELECTED", updatedBy: input.actorId },
  });
  return updated;
}

export async function sendRfi(input: ActorContext & { rfiId: string }) {
  const rfi = await prisma.supplierRfi.findFirst({ where: { id: input.rfiId, organizationId: input.organizationId, deletedAt: null } });
  if (!rfi) throw new AppError("NOT_FOUND", "RFI não encontrado.");
  if (rfi.status !== "DRAFT") throw new AppError("VALIDATION_ERROR", "Apenas RFIs em rascunho podem ser enviados.");
  const recipients = await prisma.supplierRfiRecipient.findMany({ where: { rfiId: rfi.id } });
  if (recipients.length === 0) throw new AppError("VALIDATION_ERROR", "Adicione ao menos um fornecedor antes de enviar.");
  const updated = await prisma.supplierRfi.update({
    where: { id: rfi.id },
    data: { status: "SENT", updatedBy: input.actorId },
  });
  // Enfileira e-mail para cada fornecedor com e-mail cadastrado (best-effort).
  const supplierIds = recipients.map((r) => r.supplierId);
  const suppliers = supplierIds.length
    ? await prisma.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true, email: true } })
    : [];
  const supMap = new Map(suppliers.map((s) => [s.id, s]));
  for (const rec of recipients) {
    const sup = supMap.get(rec.supplierId);
    if (!sup?.email) continue;
    await enqueueJob({
      type: "email.send",
      payload: {
        to: sup.email,
        subject: `RFI de Fornecedores ${rfi.code} - ${rfi.title}`,
        html: `<p>Olá ${sup.name},</p><p>Solicitamos cotação para: <strong>${rfi.title}</strong>.</p>${rfi.description ? `<p>${rfi.description}</p>` : ""}${rfi.dueDate ? `<p>Prazo: ${rfi.dueDate.toISOString().slice(0, 10)}</p>` : ""}`,
      },
      dedupeKey: `email.rfi:${rfi.id}:${rec.supplierId}`,
    });
  }
  return updated;
}

export async function ensureResponseToken(recipientId: string): Promise<string> {
  const rec = await prisma.supplierRfiRecipient.findUnique({ where: { id: recipientId } });
  if (!rec) throw new AppError("NOT_FOUND", "Recipient não encontrado.");
  if (rec.responseToken) return rec.responseToken;
  const token = randomBytes(32).toString("hex");
  await prisma.supplierRfiRecipient.update({ where: { id: recipientId }, data: { responseToken: token } });
  return token;
}

export async function getRfiResponseByToken(token: string) {
  let rec = await prisma.supplierRfiRecipient.findUnique({ where: { responseToken: token } });
  if (!rec) throw new AppError("NOT_FOUND", "Link de resposta inválido ou expirado.");
  const rfi = await prisma.supplierRfi.findFirst({ where: { id: rec.rfiId, deletedAt: null } });
  if (!rfi) throw new AppError("NOT_FOUND", "RFI não encontrado.");
  const supplier = await prisma.supplier.findUnique({ where: { id: rec.supplierId }, select: { id: true, name: true } });
  return {
    rfi: { id: rfi.id, code: rfi.code, title: rfi.title, description: rfi.description, dueDate: rfi.dueDate ? rfi.dueDate.toISOString().slice(0, 10) : null, status: rfi.status },
    recipient: { id: rec.id, supplierId: rec.supplierId, supplierName: supplier?.name ?? rec.supplierId, status: rec.status, quotedAmount: rec.quotedAmount ? rec.quotedAmount.toString() : null, leadTimeDays: rec.leadTimeDays, notes: rec.notes },
  };
}

export async function submitRfiResponseByToken(token: string, data: { quotedAmount?: number; leadTimeDays?: number; notes?: string | null }) {
  const rec = await prisma.supplierRfiRecipient.findUnique({ where: { responseToken: token } });
  if (!rec) throw new AppError("NOT_FOUND", "Link de resposta inválido ou expirado.");
  const rfi = await prisma.supplierRfi.findFirst({ where: { id: rec.rfiId, deletedAt: null } });
  if (!rfi) throw new AppError("NOT_FOUND", "RFI não encontrado.");
  if (rfi.status === "CANCELLED" || rfi.status === "CONVERTED") throw new AppError("VALIDATION_ERROR", "RFI não aceita mais respostas.");
  const updated = await prisma.supplierRfiRecipient.update({
    where: { id: rec.id },
    data: {
      status: "RESPONDED",
      quotedAmount: data.quotedAmount != null ? data.quotedAmount : rec.quotedAmount,
      leadTimeDays: data.leadTimeDays != null ? data.leadTimeDays : rec.leadTimeDays,
      notes: data.notes !== undefined ? data.notes : rec.notes,
      respondedAt: new Date(),
    },
  });
  await prisma.supplierRfi.update({ where: { id: rfi.id }, data: { status: "RESPONDED", updatedBy: rfi.updatedBy } });
  return { rfi, recipient: updated };
}

export async function cancelRfi(input: ActorContext & { rfiId: string }) {
  const rfi = await prisma.supplierRfi.findFirst({ where: { id: input.rfiId, organizationId: input.organizationId, deletedAt: null } });
  if (!rfi) throw new AppError("NOT_FOUND", "RFI não encontrado.");
  const updated = await prisma.supplierRfi.update({
    where: { id: rfi.id },
    data: { status: "CANCELLED", updatedBy: input.actorId },
  });
  return updated;
}

export async function convertToQuotation(input: ActorContext & { rfiId: string }) {
  const rfi = await prisma.supplierRfi.findFirst({
    where: { id: input.rfiId, organizationId: input.organizationId, deletedAt: null },
    include: { recipients: true },
  });
  if (!rfi) throw new AppError("NOT_FOUND", "RFI não encontrado.");
  if (rfi.status !== "SELECTED") throw new AppError("VALIDATION_ERROR", "Apenas RFIs com fornecedor selecionado podem ser convertidos em cotação.");
  if (!rfi.selectedSupplierId) throw new AppError("VALIDATION_ERROR", "Nenhum fornecedor selecionado.");

  const recipient = rfi.recipients.find((r) => r.supplierId === rfi.selectedSupplierId);
  if (!recipient || recipient.status !== "RESPONDED") {
    throw new AppError("VALIDATION_ERROR", "O fornecedor selecionado não possui resposta registrada.");
  }

  await assertProcurementProject(input.organizationId, rfi.projectId);

  const supplier = await prisma.supplier.findFirst({ where: { id: rfi.selectedSupplierId, organizationId: input.organizationId, deletedAt: null } });
  if (!supplier) throw new AppError("NOT_FOUND", "Fornecedor selecionado não encontrado.");

  const quotedAmount = recipient.quotedAmount ? Number(recipient.quotedAmount) : 0;
  const leadTimeDays = recipient.leadTimeDays ?? null;

  const prCode = await nextProcurementCode(rfi.projectId, "PR");
  const qtCode = await nextProcurementCode(rfi.projectId, "QT");

  const { request, quotation } = await prisma.$transaction(async (tx) => {
    const createdRequest = await tx.purchaseRequest.create({
      data: {
        organizationId: input.organizationId,
        projectId: rfi.projectId,
        code: prCode,
        title: rfi.title,
        description: rfi.description,
        priority: "MEDIUM",
        status: "DRAFT",
        wbsNodeId: rfi.wbsNodeId,
        activityId: rfi.activityId,
        createdBy: input.actorId,
        updatedBy: input.actorId,
        items: {
          create: [{
            itemNumber: 1,
            description: rfi.title,
            quantity: 1,
            unit: "un",
            estimatedUnitPrice: quotedAmount || null,
            estimatedTotalPrice: quotedAmount || null,
            notes: recipient.notes ?? null,
          }],
        },
      },
      include: { items: true },
    });

    const createdQuotation = await tx.quotation.create({
      data: {
        organizationId: input.organizationId,
        projectId: rfi.projectId,
        requestId: createdRequest.id,
        supplierId: rfi.selectedSupplierId!,
        code: qtCode,
        status: "DRAFT",
        leadTimeDays,
        totalAmount: quotedAmount,
        notes: recipient.notes ?? null,
        createdBy: input.actorId,
        updatedBy: input.actorId,
        items: {
          create: [{
            requestItemId: createdRequest.items[0].id,
            description: rfi.title,
            quantity: 1,
            unit: "un",
            unitPrice: quotedAmount,
            totalPrice: quotedAmount,
            leadTimeDays,
            notes: recipient.notes ?? null,
          }],
        },
      },
      include: { items: true, supplier: true },
    });

    await tx.purchaseRequest.update({
      where: { id: createdRequest.id },
      data: { status: "QUOTING", updatedBy: input.actorId, version: { increment: 1 } },
    });

    return { request: createdRequest, quotation: createdQuotation };
  });

  const updatedRfi = await prisma.supplierRfi.update({
    where: { id: rfi.id },
    data: { status: "CONVERTED", convertedQuotationId: quotation.id, updatedBy: input.actorId },
  });

  await audit(input, rfi.projectId, "SupplierRfi", "CONVERT", {
    objectId: rfi.id,
    oldValue: { status: rfi.status },
    newValue: { status: "CONVERTED", quotationId: quotation.id, requestId: request.id },
  });
  await emitDomainEvent(input, rfi.projectId, "SupplierRfi.Converted", "SupplierRfi", rfi.id, {
    quotationId: quotation.id,
    requestId: request.id,
    supplierId: rfi.selectedSupplierId,
  });

  return { rfi: updatedRfi, quotation, purchaseRequest: request };
}