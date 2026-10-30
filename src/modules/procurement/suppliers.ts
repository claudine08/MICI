import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { z } from "zod";
import {
  createSupplierSchema,
  updateSupplierSchema,
} from "@/modules/procurement/schemas";
import {
  ActorContext,
  audit,
  emitDomainEvent,
  nextProcurementCode,
} from "@/modules/procurement/common";

export async function createSupplier(
  input: z.input<typeof createSupplierSchema>,
  actor: ActorContext
) {
  const data = createSupplierSchema.parse(input);

  if (data.clientUuid) {
    const existing = await prisma.supplier.findFirst({
      where: {
        organizationId: actor.organizationId,
        clientUuid: data.clientUuid,
        deletedAt: null,
      },
    });
    if (existing) return existing;
  }

  const code = data.code ?? (await nextProcurementCode(actor.organizationId, "SP"));

  const existingCode = await prisma.supplier.findFirst({
    where: {
      organizationId: actor.organizationId,
      code,
      deletedAt: null,
    },
  });
  if (existingCode) {
    throw new AppError("CONFLICT", `Fornecedor com código '${code}' já existe nesta organização.`);
  }

  const supplier = await prisma.supplier.create({
    data: {
      organizationId: actor.organizationId,
      code,
      name: data.name,
      tradeName: data.tradeName ?? null,
      taxId: data.taxId ?? null,
      category: data.category ?? null,
      email: data.email || null,
      phone: data.phone ?? null,
      contactName: data.contactName ?? null,
      address: data.address ?? null,
      notes: data.notes ?? null,
      clientUuid: data.clientUuid ?? null,
      createdBy: actor.actorId,
      updatedBy: actor.actorId,
    },
  });

  await audit(actor, null, "Supplier", "CREATE", {
    objectId: supplier.id,
    newValue: supplier,
  });

  await emitDomainEvent(
    actor,
    null,
    "Supplier.Created",
    "Supplier",
    supplier.id,
    { code: supplier.code, name: supplier.name }
  );

  return supplier;
}

export async function updateSupplier(
  supplierId: string,
  input: z.input<typeof updateSupplierSchema>,
  actor: ActorContext
) {
  const data = updateSupplierSchema.parse(input);

  const current = await prisma.supplier.findFirst({
    where: {
      id: supplierId,
      organizationId: actor.organizationId,
      deletedAt: null,
    },
  });
  if (!current) {
    throw new AppError("NOT_FOUND", "Fornecedor não encontrado.");
  }

  const updated = await prisma.supplier.update({
    where: { id: supplierId },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.tradeName !== undefined ? { tradeName: data.tradeName || null } : {}),
      ...(data.taxId !== undefined ? { taxId: data.taxId || null } : {}),
      ...(data.category !== undefined ? { category: data.category || null } : {}),
      ...(data.email !== undefined ? { email: data.email || null } : {}),
      ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
      ...(data.contactName !== undefined ? { contactName: data.contactName || null } : {}),
      ...(data.address !== undefined ? { address: data.address || null } : {}),
      ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      updatedBy: actor.actorId,
      version: { increment: 1 },
    },
  });

  await audit(actor, null, "Supplier", "UPDATE", {
    objectId: supplierId,
    oldValue: current,
    newValue: updated,
  });

  return updated;
}

export async function deleteSupplier(supplierId: string, actor: ActorContext) {
  const current = await prisma.supplier.findFirst({
    where: {
      id: supplierId,
      organizationId: actor.organizationId,
      deletedAt: null,
    },
    include: {
      quotations: {
        where: { deletedAt: null },
        take: 1,
      },
    },
  });
  if (!current) {
    throw new AppError("NOT_FOUND", "Fornecedor não encontrado.");
  }

  if (current.quotations.length > 0) {
    throw new AppError(
      "CONFLICT",
      "Não é possível excluir fornecedor com cotações vinculadas. Desative-o alterando o status para Inativo."
    );
  }

  await prisma.supplier.update({
    where: { id: supplierId },
    data: {
      deletedAt: new Date(),
      deletedBy: actor.actorId,
    },
  });

  await audit(actor, null, "Supplier", "DELETE", {
    objectId: supplierId,
    oldValue: current,
  });

  return { success: true };
}

