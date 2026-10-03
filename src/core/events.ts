import { prisma } from "@/lib/prisma";

// Outbox de eventos de domínio (§53, ADR-009): gravar evento e efeito na mesma
// transação; publicador assíncrono consome PENDING via job (ADR-015).

export interface DomainEventInput {
  organizationId?: string | null;
  projectId?: string | null;
  actorId?: string | null;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload?: Record<string, unknown>;
  eventVersion?: number;
}

export async function enqueueDomainEvent(input: DomainEventInput): Promise<string> {
  const event = await prisma.domainEvent.create({
    data: {
      organizationId: input.organizationId ?? null,
      projectId: input.projectId ?? null,
      actorId: input.actorId ?? null,
      eventType: input.eventType,
      eventVersion: input.eventVersion ?? 1,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      payload: (input.payload ?? {}) as object,
    },
    select: { id: true },
  });
  return event.id;
}
