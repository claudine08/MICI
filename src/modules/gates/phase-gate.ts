import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { nextPhase, prevPhase, pendingBlockingGates, type BlockingGateStatus } from "./engine";
import { ensureProjectGateInstances } from "./instances";

// BR-001: projeto não avança de fase sem aprovar/dispensar o gate obrigatório
// da fase atual, quando configurado. Toda decisão é auditada (BR-011).

interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

const TERMINAL_STATUSES = new Set(["COMPLETED", "CANCELLED", "ARCHIVED"]);

export async function changeProjectPhase(
  input: ActorContext & { projectId: string; direction: "advance" | "retreat" }
): Promise<{ previousPhase: string; currentPhase: string }> {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, organizationId: input.organizationId, deletedAt: null },
    select: { id: true, code: true, currentPhase: true, status: true },
  });
  if (!project) {
    throw new AppError("NOT_FOUND", "Projeto não encontrado nesta organização.");
  }
  if (TERMINAL_STATUSES.has(project.status)) {
    throw new AppError(
      "CONFLICT",
      `Projeto em status final (${project.status}): fase não pode ser alterada.`
    );
  }

  const previousPhase = project.currentPhase;
  let targetPhase: string | null;

  if (input.direction === "advance") {
    targetPhase = nextPhase(previousPhase);
    if (!targetPhase) {
      throw new AppError("CONFLICT", `Projeto já está na última fase (${previousPhase}).`);
    }

    // BR-001: gates obrigatórios da fase atual devem estar liberados.
    const blockingDefinitions = await prisma.gateDefinition.findMany({
      where: {
        organizationId: input.organizationId,
        phase: previousPhase,
        required: true,
        deletedAt: null,
      },
      select: { id: true, code: true, name: true },
      orderBy: { orderIndex: "asc" },
    });

    if (blockingDefinitions.length > 0) {
      await ensureProjectGateInstances(input.organizationId, project.id, input.actorId);
      const instances = await prisma.gateInstance.findMany({
        where: { projectId: project.id, gateDefinitionId: { in: blockingDefinitions.map((d) => d.id) } },
        select: { gateDefinitionId: true, status: true },
      });
      const statusByDefinition = new Map(instances.map((i) => [i.gateDefinitionId, i.status]));
      const gates: BlockingGateStatus[] = blockingDefinitions.map((definition) => ({
        code: definition.code,
        name: definition.name,
        status: statusByDefinition.get(definition.id) ?? "NOT_STARTED",
      }));

      const pending = pendingBlockingGates(gates);
      if (pending.length > 0) {
        throw new AppError(
          "PHASE_ADVANCE_BLOCKED",
          `Avanço de fase bloqueado (BR-001): ${pending
            .map((gate) => gate.code)
            .join(", ")} pendente(s) na fase ${previousPhase}.`,
          {
            details: {
              currentPhase: previousPhase,
              targetPhase,
              pendingGates: pending,
            },
          }
        );
      }
    }
  } else {
    targetPhase = prevPhase(previousPhase);
    if (!targetPhase) {
      throw new AppError("CONFLICT", `Projeto já está na primeira fase (${previousPhase}).`);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: project.id },
      data: {
        currentPhase: targetPhase!,
        updatedBy: input.actorId,
        version: { increment: 1 },
      },
    });

    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        projectId: project.id,
        objectType: "Project",
        objectId: project.id,
        action: input.direction === "advance" ? "PHASE_ADVANCE" : "PHASE_RETREAT",
        oldValue: { currentPhase: previousPhase },
        newValue: { currentPhase: targetPhase },
        reason:
          input.direction === "advance"
            ? `BR-001 verificado para ${previousPhase} → ${targetPhase}`
            : null,
        correlationId: input.correlationId ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });

    await tx.domainEvent.create({
      data: {
        organizationId: input.organizationId,
        projectId: project.id,
        actorId: input.actorId,
        eventType: "Project.PhaseChanged",
        aggregateType: "Project",
        aggregateId: project.id,
        payload: { from: previousPhase, to: targetPhase, direction: input.direction },
      },
    });
  });

  return { previousPhase, currentPhase: targetPhase };
}
