import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";

// Clientes do portfólio (E03-US02). Escopo sempre pelo organization_id do
// contexto (§10.4); exclusão lógica com guarda de projetos ativos.

interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

export interface ClientInput {
  code?: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
}

export interface ClientUpdateInput {
  code?: string | null;
  name?: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
}

async function assertCodeAvailable(
  organizationId: string,
  code: string | undefined | null,
  excludeId?: string
) {
  if (!code) return;
  const existing = await prisma.client.findFirst({
    where: { organizationId, code, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  if (existing) {
    throw new AppError("CONFLICT", `Código de cliente "${code}" já existe.`);
  }
}

// Gera c��digo sequencial por organiza��ǜo (CLI001, CLI002, ...) quando o
// usuǭrio nǜo informa um c��digo manual, mantendo o padrǜo dos demais m��dulos.
export async function nextClientCode(organizationId: string): Promise<string> {
  const rows = await prisma.client.findMany({
    where: { organizationId },
    select: { code: true },
  });
  let max = 0;
  for (const { code } of rows) {
    const match = /^CLI(\d+)$/.exec(code ?? "");
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `CLI${String(max + 1).padStart(3, "0")}`;
}

export async function createClient(input: ActorContext & ClientInput) {
  let code = input.code?.trim() ? input.code.trim().toUpperCase() : null;
  if (!code) {
    code = await nextClientCode(input.organizationId);
  }
  await assertCodeAvailable(input.organizationId, code);

  const client = await prisma.client.create({
    data: {
      organizationId: input.organizationId,
      code,
      name: input.name.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      notes: input.notes?.trim() || null,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      objectType: "Client",
      objectId: client.id,
      action: "CREATE",
      newValue: { code: client.code, name: client.name },
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });

  return client;
}

export async function updateClient(
  input: ActorContext & { clientId: string } & ClientUpdateInput
) {
  const client = await prisma.client.findFirst({
    where: { id: input.clientId, organizationId: input.organizationId, deletedAt: null },
  });
  if (!client) {
    throw new AppError("NOT_FOUND", "Cliente não encontrado nesta organização.");
  }

  const code =
    input.code !== undefined
      ? input.code?.trim()
        ? input.code.trim().toUpperCase()
        : null
      : undefined;
  if (code !== undefined) {
    await assertCodeAvailable(input.organizationId, code, client.id);
  }

  const updated = await prisma.client.update({
    where: { id: client.id },
    data: {
      ...(code !== undefined ? { code } : {}),
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.email !== undefined ? { email: input.email?.trim() || null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
      ...(input.address !== undefined ? { address: input.address?.trim() || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      updatedBy: input.actorId,
      version: { increment: 1 },
    },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      objectType: "Client",
      objectId: client.id,
      action: "UPDATE",
      oldValue: { code: client.code, name: client.name },
      newValue: { code: updated.code, name: updated.name },
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });

  return updated;
}

export async function deleteClient(input: ActorContext & { clientId: string }) {
  const client = await prisma.client.findFirst({
    where: { id: input.clientId, organizationId: input.organizationId, deletedAt: null },
    select: { id: true, code: true, name: true },
  });
  if (!client) {
    throw new AppError("NOT_FOUND", "Cliente não encontrado nesta organização.");
  }

  const activeProjects = await prisma.project.count({
    where: { clientId: client.id, deletedAt: null },
  });
  if (activeProjects > 0) {
    throw new AppError(
      "CONFLICT",
      `Cliente possui ${activeProjects} projeto(s) ativo(s). Transfira ou remova-os antes.`
    );
  }

  await prisma.client.update({
    where: { id: client.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      objectType: "Client",
      objectId: client.id,
      action: "DELETE",
      oldValue: { code: client.code, name: client.name },
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });

  return { clientId: client.id };
}
