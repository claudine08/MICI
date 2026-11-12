import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { enqueueJob } from "@/modules/integrations/jobs";

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
        ? { recipients: { create: input.supplierIds.map((sid) => ({ organizationId: input.organizationId, supplierId: sid })) } }
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
  return prisma.supplierRfiRecipient.create({ data: { organizationId: input.organizationId, rfiId: rfi.id, supplierId: input.supplierId } });
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

export async function cancelRfi(input: ActorContext & { rfiId: string }) {
  const rfi = await prisma.supplierRfi.findFirst({ where: { id: input.rfiId, organizationId: input.organizationId, deletedAt: null } });
  if (!rfi) throw new AppError("NOT_FOUND", "RFI não encontrado.");
  const updated = await prisma.supplierRfi.update({
    where: { id: rfi.id },
    data: { status: "CANCELLED", updatedBy: input.actorId },
  });
  return updated;
}