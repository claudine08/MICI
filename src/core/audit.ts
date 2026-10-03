import { prisma } from "@/lib/prisma";

// Auditoria append-only (§54, BR-011). Nunca atualizar nem excluir registros.

export interface AuditInput {
  organizationId?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
  projectId?: string | null;
  objectType: string;
  objectId?: string | null;
  action: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  ipAddress?: string | null;
  correlationId?: string | null;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId ?? null,
      actorId: input.actorId ?? null,
      actorLabel: input.actorLabel ?? null,
      projectId: input.projectId ?? null,
      objectType: input.objectType,
      objectId: input.objectId ?? null,
      action: input.action,
      ...(input.oldValue !== undefined ? { oldValue: input.oldValue as object } : {}),
      ...(input.newValue !== undefined ? { newValue: input.newValue as object } : {}),
      reason: input.reason ?? null,
      ipAddress: input.ipAddress ?? null,
      correlationId: input.correlationId ?? null,
    },
  });
}

export interface AuditQuery {
  organizationId: string;
  objectType?: string;
  objectId?: string;
  action?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditEventRow {
  id: string;
  actorLabel: string | null;
  objectType: string;
  objectId: string | null;
  action: string;
  oldValue: unknown;
  newValue: unknown;
  correlationId: string | null;
  createdAt: Date;
}

// Leitura da trilha — SEMPRE escopada pelo organization_id do contexto (§10.4).
export async function listAuditEvents(
  query: AuditQuery
): Promise<{ items: AuditEventRow[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 50));
  const where = {
    organizationId: query.organizationId,
    ...(query.objectType ? { objectType: query.objectType } : {}),
    ...(query.objectId ? { objectId: query.objectId } : {}),
    ...(query.action ? { action: query.action } : {}),
  };

  const [events, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditEvent.count({ where }),
  ]);

  return {
    items: events.map((event) => ({
      id: event.id,
      actorLabel: event.actorLabel,
      objectType: event.objectType,
      objectId: event.objectId,
      action: event.action,
      oldValue: event.oldValue ?? null,
      newValue: event.newValue ?? null,
      correlationId: event.correlationId,
      createdAt: event.createdAt,
    })),
    total,
    page,
    pageSize,
  };
}
