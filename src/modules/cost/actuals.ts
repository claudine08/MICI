import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { assertCostProject } from "@/modules/cost/selectors";

// Custos realizados (E08, §29): valores efetivamente incorridos. Código
// automático CA001…. Pode vincular a item de custo e/ou compromisso.

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
  data: { objectId: string; oldValue?: unknown; newValue?: unknown }
) {
  return prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      projectId,
      objectType: "CostActual",
      objectId: data.objectId,
      action,
      ...(data.oldValue !== undefined ? { oldValue: data.oldValue as never } : {}),
      ...(data.newValue !== undefined ? { newValue: data.newValue as never } : {}),
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });
}

function parseDay(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

async function loadLive(organizationId: string, id: string) {
  const row = await prisma.costActual.findFirst({
    where: { id, organizationId, deletedAt: null },
  });
  if (!row) {
    throw new AppError("NOT_FOUND", "Custo realizado não encontrado nesta organização.");
  }
  return row;
}

async function assertItemLink(organizationId: string, projectId: string, costItemId: string | null) {
  if (!costItemId) return;
  const item = await prisma.costItem.findFirst({
    where: { id: costItemId, organizationId, projectId, deletedAt: null },
    select: { id: true },
  });
  if (!item) {
    throw new AppError("VALIDATION_ERROR", "Item de custo inválido para este projeto.");
  }
}

async function assertCommitmentLink(
  organizationId: string,
  projectId: string,
  commitmentId: string | null
) {
  if (!commitmentId) return;
  const commitment = await prisma.costCommitment.findFirst({
    where: { id: commitmentId, organizationId, projectId, deletedAt: null },
    select: { id: true },
  });
  if (!commitment) {
    throw new AppError("VALIDATION_ERROR", "Compromisso inválido para este projeto.");
  }
}

async function nextCode(projectId: string): Promise<string> {
  const rows = await prisma.costActual.findMany({ where: { projectId }, select: { code: true } });
  let max = 0;
  for (const { code } of rows) {
    const match = /^CA(\d+)$/.exec(code);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `CA${String(max + 1).padStart(3, "0")}`;
}

export interface CreateActualInput {
  projectId: string;
  code?: string;
  description: string;
  amount: number;
  incurredAt: string;
  costItemId?: string | null;
  commitmentId?: string | null;
}

export async function createActual(input: ActorContext & CreateActualInput) {
  await assertCostProject(input.organizationId, input.projectId);
  await assertItemLink(input.organizationId, input.projectId, input.costItemId ?? null);
  await assertCommitmentLink(input.organizationId, input.projectId, input.commitmentId ?? null);

  let code = input.code?.trim();
  if (code) {
    const existing = await prisma.costActual.findFirst({
      where: { projectId: input.projectId, code },
      select: { id: true },
    });
    if (existing) {
      throw new AppError("CONFLICT", `Código de realizado "${code}" já existe no projeto.`);
    }
  } else {
    code = await nextCode(input.projectId);
  }

  const row = await prisma.costActual.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      code,
      description: input.description.trim(),
      amount: input.amount,
      incurredAt: parseDay(input.incurredAt),
      costItemId: input.costItemId ?? null,
      commitmentId: input.commitmentId ?? null,
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
        objectType: "CostActual",
        objectId: row.id,
        action: "CREATE",
        newValue: { code: row.code, amount: Number(row.amount) },
        correlationId: input.correlationId ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
    await tx.domainEvent.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        actorId: input.actorId,
        eventType: "Cost.ActualRecorded",
        aggregateType: "CostActual",
        aggregateId: row.id,
        payload: { code: row.code, amount: Number(row.amount) },
      },
    });
  });

  return row;
}

export interface UpdateActualInput {
  actualId: string;
  code?: string;
  description?: string;
  amount?: number;
  incurredAt?: string;
  costItemId?: string | null;
  commitmentId?: string | null;
}

export async function updateActual(input: ActorContext & UpdateActualInput) {
  const row = await loadLive(input.organizationId, input.actualId);

  if (input.costItemId !== undefined) {
    await assertItemLink(input.organizationId, row.projectId, input.costItemId);
  }
  if (input.commitmentId !== undefined) {
    await assertCommitmentLink(input.organizationId, row.projectId, input.commitmentId);
  }
  if (input.code !== undefined && input.code.trim() !== row.code) {
    const existing = await prisma.costActual.findFirst({
      where: { projectId: row.projectId, code: input.code.trim() },
      select: { id: true },
    });
    if (existing) {
      throw new AppError("CONFLICT", `Código de realizado "${input.code.trim()}" já existe no projeto.`);
    }
  }

  const updated = await prisma.costActual.update({
    where: { id: row.id },
    data: {
      ...(input.code !== undefined ? { code: input.code.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.incurredAt !== undefined ? { incurredAt: parseDay(input.incurredAt) } : {}),
      ...(input.costItemId !== undefined ? { costItemId: input.costItemId } : {}),
      ...(input.commitmentId !== undefined ? { commitmentId: input.commitmentId } : {}),
      updatedBy: input.actorId,
      version: { increment: 1 },
    },
  });

  await audit(input, row.projectId, "UPDATE", {
    objectId: row.id,
    oldValue: { code: row.code, amount: Number(row.amount) },
    newValue: { code: updated.code, amount: Number(updated.amount) },
  });

  return updated;
}

export async function deleteActual(input: ActorContext & { actualId: string }) {
  const row = await loadLive(input.organizationId, input.actualId);

  await prisma.costActual.update({
    where: { id: row.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId },
  });

  await audit(input, row.projectId, "DELETE", {
    objectId: row.id,
    oldValue: { code: row.code, amount: Number(row.amount) },
  });

  return { actualId: row.id };
}
