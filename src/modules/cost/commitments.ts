import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { assertCostProject } from "@/modules/cost/selectors";

// Compromissos de custo (E08, §29): contratos/POs que consomem o orçamento.
// CLOSED/CANCELLED não contam para o comprometido. Código automático CC001….

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
      objectType: "CostCommitment",
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
  const row = await prisma.costCommitment.findFirst({
    where: { id, organizationId, deletedAt: null },
  });
  if (!row) {
    throw new AppError("NOT_FOUND", "Compromisso não encontrado nesta organização.");
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

async function nextCode(projectId: string, prefix: "CC"): Promise<string> {
  const rows = await prisma.costCommitment.findMany({ where: { projectId }, select: { code: true } });
  let max = 0;
  for (const { code } of rows) {
    const match = new RegExp(`^${prefix}(\\d+)$`).exec(code);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export interface CreateCommitmentInput {
  projectId: string;
  code?: string;
  description: string;
  supplier?: string;
  amount: number;
  committedAt: string;
  costItemId?: string | null;
}

export async function createCommitment(input: ActorContext & CreateCommitmentInput) {
  await assertCostProject(input.organizationId, input.projectId);
  await assertItemLink(input.organizationId, input.projectId, input.costItemId ?? null);

  let code = input.code?.trim();
  if (code) {
    const existing = await prisma.costCommitment.findFirst({
      where: { projectId: input.projectId, code },
      select: { id: true },
    });
    if (existing) {
      throw new AppError("CONFLICT", `Código de compromisso "${code}" já existe no projeto.`);
    }
  } else {
    code = await nextCode(input.projectId, "CC");
  }

  const row = await prisma.costCommitment.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      code,
      description: input.description.trim(),
      supplier: input.supplier?.trim() || null,
      amount: input.amount,
      committedAt: parseDay(input.committedAt),
      costItemId: input.costItemId ?? null,
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
        objectType: "CostCommitment",
        objectId: row.id,
        action: "CREATE",
        newValue: { code: row.code, amount: Number(row.amount), status: row.status },
        correlationId: input.correlationId ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
    await tx.domainEvent.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        actorId: input.actorId,
        eventType: "Cost.Committed",
        aggregateType: "CostCommitment",
        aggregateId: row.id,
        payload: { code: row.code, amount: Number(row.amount) },
      },
    });
  });

  return row;
}

export interface UpdateCommitmentInput {
  commitmentId: string;
  code?: string;
  description?: string;
  supplier?: string | null;
  amount?: number;
  committedAt?: string;
  costItemId?: string | null;
  status?: "OPEN" | "CLOSED" | "CANCELLED";
}

export async function updateCommitment(input: ActorContext & UpdateCommitmentInput) {
  const row = await loadLive(input.organizationId, input.commitmentId);

  if (input.costItemId !== undefined) {
    await assertItemLink(input.organizationId, row.projectId, input.costItemId);
  }
  if (input.code !== undefined && input.code.trim() !== row.code) {
    const existing = await prisma.costCommitment.findFirst({
      where: { projectId: row.projectId, code: input.code.trim() },
      select: { id: true },
    });
    if (existing) {
      throw new AppError("CONFLICT", `Código de compromisso "${input.code.trim()}" já existe no projeto.`);
    }
  }

  const updated = await prisma.costCommitment.update({
    where: { id: row.id },
    data: {
      ...(input.code !== undefined ? { code: input.code.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.supplier !== undefined ? { supplier: input.supplier?.trim() || null } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.committedAt !== undefined ? { committedAt: parseDay(input.committedAt) } : {}),
      ...(input.costItemId !== undefined ? { costItemId: input.costItemId } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      updatedBy: input.actorId,
      version: { increment: 1 },
    },
  });

  await audit(input, row.projectId, "UPDATE", {
    objectId: row.id,
    oldValue: { code: row.code, amount: Number(row.amount), status: row.status },
    newValue: { code: updated.code, amount: Number(updated.amount), status: updated.status },
  });

  return updated;
}

// Exclusão lógica bloqueada enquanto houver realizado vinculado.
export async function deleteCommitment(input: ActorContext & { commitmentId: string }) {
  const row = await loadLive(input.organizationId, input.commitmentId);

  const actualCount = await prisma.costActual.count({
    where: { commitmentId: row.id, organizationId: input.organizationId, deletedAt: null },
  });
  if (actualCount > 0) {
    throw new AppError(
      "CONFLICT",
      `Compromisso participa de ${actualCount} realizado(s): remova-os antes de excluir.`
    );
  }

  await prisma.costCommitment.update({
    where: { id: row.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId },
  });

  await audit(input, row.projectId, "DELETE", {
    objectId: row.id,
    oldValue: { code: row.code, amount: Number(row.amount) },
  });

  return { commitmentId: row.id };
}
