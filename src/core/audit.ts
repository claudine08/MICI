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
