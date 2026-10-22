import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";

// Helpers de escrita compartilhados pelo módulo de campo (E12): auditoria,
// domain events, geração de código por prefixo e validação de vínculos.

export interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

export function toDate(value: string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  return new Date(`${value}T00:00:00.000Z`);
}

export function audit(
  input: ActorContext,
  projectId: string,
  objectType: string,
  action: string,
  data: { objectId: string; oldValue?: unknown; newValue?: unknown; reason?: string | null }
) {
  return prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      projectId,
      objectType,
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

export async function emitDomainEvent(
  input: ActorContext,
  projectId: string,
  eventType: string,
  aggregateType: string,
  aggregateId: string,
  payload: Record<string, unknown>
) {
  await prisma.domainEvent.create({
    data: {
      organizationId: input.organizationId,
      projectId,
      actorId: input.actorId,
      eventType,
      aggregateType,
      aggregateId,
      payload: payload as never,
    },
  });
}

// Código automático por projeto e prefixo (FD/FT/CN/PH/PM001).
export async function nextFieldCode(
  projectId: string,
  prefix: "FD" | "FT" | "CN" | "PH" | "PM"
): Promise<string> {
  let rows: { code: string }[];
  switch (prefix) {
    case "FD":
      rows = await prisma.fieldDiary.findMany({ where: { projectId }, select: { code: true } });
      break;
    case "FT":
      rows = await prisma.fieldTask.findMany({ where: { projectId }, select: { code: true } });
      break;
    case "CN":
      rows = await prisma.constraint.findMany({ where: { projectId }, select: { code: true } });
      break;
    case "PM":
      rows = await prisma.progressMeasurement.findMany({
        where: { projectId },
        select: { code: true },
      });
      break;
    default:
      rows = await prisma.photoEvidence.findMany({
        where: { projectId },
        select: { code: true },
      });
  }

  let max = 0;
  for (const { code } of rows) {
    const match = new RegExp(`^${prefix}(\\d+)$`).exec(code);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

// Membro ativo da organização (responsável de tarefa/restrição).
export async function assertMember(organizationId: string, userId: string) {
  const membership = await prisma.organizationMembership.findFirst({
    where: { organizationId, userId, status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  if (!membership) {
    throw new AppError("VALIDATION_ERROR", "Responsável não é membro ativo desta organização.");
  }
}

// Vínculos opcionais de campo (WBS / atividade) precisam pertencer ao projeto.
export async function assertFieldLinks(
  organizationId: string,
  projectId: string,
  links: { wbsNodeId?: string | null; activityId?: string | null }
) {
  if (links.wbsNodeId) {
    const node = await prisma.wBSNode.findFirst({
      where: { id: links.wbsNodeId, organizationId, projectId, deletedAt: null },
      select: { id: true },
    });
    if (!node) {
      throw new AppError("VALIDATION_ERROR", "Nó de WBS inválido para este projeto.");
    }
  }
  if (links.activityId) {
    const activity = await prisma.scheduleActivity.findFirst({
      where: { id: links.activityId, organizationId, projectId, deletedAt: null },
      select: { id: true },
    });
    if (!activity) {
      throw new AppError("VALIDATION_ERROR", "Atividade inválida para este projeto.");
    }
  }
}

// Código duplicado no projeto → CONFLICT (padrão dos módulos existentes).
export async function assertCodeFree(
  projectId: string,
  code: string,
  exists: (where: { projectId: string; code: string }) => Promise<{ id: string } | null>,
  entityLabel: string
) {
  const existing = await exists({ projectId, code });
  if (existing) {
    throw new AppError("CONFLICT", `Código ${entityLabel} "${code}" já existe no projeto.`);
  }
}

// Idempotência offline (§38): o cliente gera um UUID por registro; se o
// reenvio chegar de novo (retry/sync), devolvemos o registro já criado em
// vez de duplicar. Retorna null quando não há clientUuid ou correspondência.
export async function findByIdempotentKey<T>(
  projectId: string,
  clientUuid: string | undefined,
  find: (where: { projectId: string; clientUuid: string }) => Promise<T | null>
): Promise<T | null> {
  if (!clientUuid) return null;
  return find({ projectId, clientUuid });
}
