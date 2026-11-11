import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";

export interface SupplierRfiRecipientRow {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierEmail: string | null;
  status: string;
  quotedAmount: string | null;
  leadTimeDays: number | null;
  notes: string | null;
  respondedAt: string | null;
}

export interface SupplierRfiRow {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  selectedSupplierId: string | null;
  convertedQuotationId: string | null;
  projectId: string;
  recipientCount: number;
  recipients: SupplierRfiRecipientRow[];
  updatedAt: Date;
}

export async function listSupplierRfis(organizationId: string, projectId?: string): Promise<SupplierRfiRow[]> {
  const rows = await prisma.supplierRfi.findMany({
    where: { organizationId, deletedAt: null, ...(projectId ? { projectId } : {}) },
    include: { recipients: true },
    orderBy: { createdAt: "desc" },
  });
  const supplierIds = [...new Set(rows.flatMap((r) => r.recipients.map((rec) => rec.supplierId)))];
  const suppliers = supplierIds.length ? await prisma.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true, email: true } }) : [];
  const supMap = new Map(suppliers.map((s) => [s.id, s]));
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    description: r.description,
    status: r.status,
    dueDate: r.dueDate ? r.dueDate.toISOString().slice(0, 10) : null,
    selectedSupplierId: r.selectedSupplierId,
    convertedQuotationId: r.convertedQuotationId,
    projectId: r.projectId,
    recipientCount: r.recipients.length,
    recipients: r.recipients.map((rec) => ({
      id: rec.id,
      supplierId: rec.supplierId,
      supplierName: supMap.get(rec.supplierId)?.name ?? rec.supplierId,
      supplierEmail: supMap.get(rec.supplierId)?.email ?? null,
      status: rec.status,
      quotedAmount: rec.quotedAmount ? rec.quotedAmount.toString() : null,
      leadTimeDays: rec.leadTimeDays,
      notes: rec.notes,
      respondedAt: rec.respondedAt ? rec.respondedAt.toISOString() : null,
    })),
    updatedAt: r.updatedAt,
  }));
}

export async function getSupplierRfi(organizationId: string, id: string): Promise<SupplierRfiRow> {
  const r = await prisma.supplierRfi.findFirst({ where: { id, organizationId, deletedAt: null }, include: { recipients: true } });
  if (!r) throw new AppError("NOT_FOUND", "RFI de fornecedor não encontrado.");
  const supplierIds = r.recipients.map((rec) => rec.supplierId);
  const suppliers = supplierIds.length ? await prisma.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true, email: true } }) : [];
  const supMap = new Map(suppliers.map((s) => [s.id, s]));
  return {
    id: r.id,
    code: r.code,
    title: r.title,
    description: r.description,
    status: r.status,
    dueDate: r.dueDate ? r.dueDate.toISOString().slice(0, 10) : null,
    selectedSupplierId: r.selectedSupplierId,
    convertedQuotationId: r.convertedQuotationId,
    projectId: r.projectId,
    recipientCount: r.recipients.length,
    recipients: r.recipients.map((rec) => ({
      id: rec.id,
      supplierId: rec.supplierId,
      supplierName: supMap.get(rec.supplierId)?.name ?? rec.supplierId,
      supplierEmail: supMap.get(rec.supplierId)?.email ?? null,
      status: rec.status,
      quotedAmount: rec.quotedAmount ? rec.quotedAmount.toString() : null,
      leadTimeDays: rec.leadTimeDays,
      notes: rec.notes,
      respondedAt: rec.respondedAt ? rec.respondedAt.toISOString() : null,
    })),
    updatedAt: r.updatedAt,
  };
}