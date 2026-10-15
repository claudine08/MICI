import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { assertCostProject } from "@/modules/cost/selectors";

// Itens de custo (E08, §29): linhas do orçamento do projeto. `amount` é
// derivado (quantity × unitPrice) e persistido para agregar. Código automático
// CI001… quando não informado.

interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

function audit(
  input: ActorContext,
  projectId: string,
  action: string,
  data: { objectId: string; oldValue?: unknown; newValue?: unknown; reason?: string | null }
) {
  return prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      projectId,
      objectType: "CostItem",
      objectId: data.objectId,
      action,
      ...(data.oldValue !== undefined ? { oldValue: data.oldValue as never } : {}),
      ...(data.newValue !== undefined ? { newValue: data.newValue as never } : {}),
      reason: data.reason ?? null,
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

async function loadLiveItem(organizationId: string, itemId: string) {
  const item = await prisma.costItem.findFirst({
    where: { id: itemId, organizationId, deletedAt: null },
  });
  if (!item) {
    throw new AppError("NOT_FOUND", "Item de custo não encontrado nesta organização.");
  }
  return item;
}

async function assertWbsLink(organizationId: string, projectId: string, wbsNodeId: string | null) {
  if (!wbsNodeId) return;
  const node = await prisma.wBSNode.findFirst({
    where: { id: wbsNodeId, organizationId, projectId, deletedAt: null },
    select: { id: true },
  });
  if (!node) {
    throw new AppError("VALIDATION_ERROR", "Nó de WBS inválido para este projeto.");
  }
}

async function nextItemCode(projectId: string): Promise<string> {
  const codes = await prisma.costItem.findMany({
    where: { projectId },
    select: { code: true },
  });
  let max = 0;
  for (const { code } of codes) {
    const match = /^CI(\d+)$/.exec(code);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `CI${String(max + 1).padStart(3, "0")}`;
}

export interface CreateCostItemInput {
  projectId: string;
  code?: string;
  description: string;
  category: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  wbsNodeId?: string | null;
  origin?: string;
  fontePreco?: string;
}

export async function createCostItem(input: ActorContext & CreateCostItemInput) {
  await assertCostProject(input.organizationId, input.projectId);
  await assertWbsLink(input.organizationId, input.projectId, input.wbsNodeId ?? null);

  let code = input.code?.trim();
  if (code) {
    const existing = await prisma.costItem.findFirst({
      where: { projectId: input.projectId, code },
      select: { id: true },
    });
    if (existing) {
      throw new AppError("CONFLICT", `Código de item "${code}" já existe no projeto.`);
    }
  } else {
    code = await nextItemCode(input.projectId);
  }

  const amount = round2(input.quantity * input.unitPrice);

  const item = await prisma.costItem.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      code,
      description: input.description.trim(),
      category: input.category.trim(),
      unit: input.unit.trim(),
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      amount,
      wbsNodeId: input.wbsNodeId ?? null,
      origin: input.origin?.trim() || null,
      fontePreco: input.fontePreco?.trim() || null,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });

  await prisma.$transaction(async (tx) => {
    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        projectId: input.projectId,
        objectType: "CostItem",
        objectId: item.id,
        action: "CREATE",
        newValue: { code: item.code, description: item.description, amount: Number(item.amount) },
        correlationId: input.correlationId ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
    await tx.domainEvent.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        actorId: input.actorId,
        eventType: "Cost.ItemCreated",
        aggregateType: "CostItem",
        aggregateId: item.id,
        payload: { code: item.code, description: item.description },
      },
    });
  });

  return item;
}

export interface UpdateCostItemInput {
  itemId: string;
  code?: string;
  description?: string;
  category?: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
  wbsNodeId?: string | null;
  origin?: string;
  fontePreco?: string;
}

export async function updateCostItem(input: ActorContext & UpdateCostItemInput) {
  const item = await loadLiveItem(input.organizationId, input.itemId);

  if (input.wbsNodeId !== undefined) {
    await assertWbsLink(input.organizationId, item.projectId, input.wbsNodeId);
  }
  if (input.code !== undefined && input.code.trim() !== item.code) {
    const existing = await prisma.costItem.findFirst({
      where: { projectId: item.projectId, code: input.code.trim() },
      select: { id: true },
    });
    if (existing) {
      throw new AppError("CONFLICT", `Código de item "${input.code.trim()}" já existe no projeto.`);
    }
  }

  const quantity = input.quantity ?? Number(item.quantity);
  const unitPrice = input.unitPrice ?? Number(item.unitPrice);
  const amount = round2(quantity * unitPrice);

  const updated = await prisma.costItem.update({
    where: { id: item.id },
    data: {
      ...(input.code !== undefined ? { code: input.code.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.category !== undefined ? { category: input.category.trim() } : {}),
      ...(input.unit !== undefined ? { unit: input.unit.trim() } : {}),
      ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
      ...(input.unitPrice !== undefined ? { unitPrice: input.unitPrice } : {}),
      ...(input.wbsNodeId !== undefined ? { wbsNodeId: input.wbsNodeId } : {}),
      ...(input.origin !== undefined ? { origin: input.origin.trim() || null } : {}),
      ...(input.fontePreco !== undefined ? { fontePreco: input.fontePreco.trim() || null } : {}),
      amount,
      updatedBy: input.actorId,
      version: { increment: 1 },
    },
  });

  await audit(input, item.projectId, "UPDATE", {
    objectId: item.id,
    oldValue: { code: item.code, amount: Number(item.amount) },
    newValue: { code: updated.code, amount: Number(updated.amount) },
  });

  return updated;
}

// Exclusão bloqueada enquanto houver compromisso ou realizado vinculado.
export async function deleteCostItem(input: ActorContext & { itemId: string }) {
  const item = await loadLiveItem(input.organizationId, input.itemId);

  const [commitmentCount, actualCount] = await Promise.all([
    prisma.costCommitment.count({
      where: { costItemId: item.id, organizationId: input.organizationId, deletedAt: null },
    }),
    prisma.costActual.count({
      where: { costItemId: item.id, organizationId: input.organizationId, deletedAt: null },
    }),
  ]);
  if (commitmentCount > 0 || actualCount > 0) {
    throw new AppError(
      "CONFLICT",
      `Item participa de ${commitmentCount} compromisso(s) e ${actualCount} realizado(s): remova-os antes de excluir.`
    );
  }

  await prisma.costItem.update({
    where: { id: item.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId },
  });

  await audit(input, item.projectId, "DELETE", {
    objectId: item.id,
    oldValue: { code: item.code, description: item.description },
  });

  return { itemId: item.id };
}
