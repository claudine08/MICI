import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { loadLiveDocument } from "@/modules/documents/selectors";

// Links genéricos de objetos (E09-US05, §92): documento ↔ requisito/WBS/
// atividade/custo/documento com relationType. Valida que o alvo existe no
// mesmo tenant antes de gravar.

interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

const TARGET_LOADERS: Record<
  string,
  (organizationId: string, targetId: string) => Promise<{ id: string } | null>
> = {
  REQUIREMENT: (organizationId, targetId) =>
    prisma.requirement.findFirst({
      where: { id: targetId, organizationId, deletedAt: null },
      select: { id: true },
    }),
  WBS_NODE: (organizationId, targetId) =>
    prisma.wBSNode.findFirst({
      where: { id: targetId, organizationId, deletedAt: null },
      select: { id: true },
    }),
  SCHEDULE_ACTIVITY: (organizationId, targetId) =>
    prisma.scheduleActivity.findFirst({
      where: { id: targetId, organizationId, deletedAt: null },
      select: { id: true },
    }),
  COST_ITEM: (organizationId, targetId) =>
    prisma.costItem.findFirst({
      where: { id: targetId, organizationId, deletedAt: null },
      select: { id: true },
    }),
  DOCUMENT: (organizationId, targetId) =>
    prisma.document.findFirst({
      where: { id: targetId, organizationId, deletedAt: null },
      select: { id: true },
    }),
};

export interface CreateDocumentLinkInput {
  documentId: string;
  targetType: string;
  targetId: string;
  relationType: string;
}

export async function createDocumentLink(input: ActorContext & CreateDocumentLinkInput) {
  const document = await loadLiveDocument(input.organizationId, input.documentId);

  if (input.targetType === "DOCUMENT" && input.targetId === document.id) {
    throw new AppError("VALIDATION_ERROR", "Um documento não pode ser linkado a ele mesmo.");
  }

  const loader = TARGET_LOADERS[input.targetType];
  if (!loader) {
    throw new AppError("VALIDATION_ERROR", `Tipo de alvo inválido: ${input.targetType}.`);
  }
  const target = await loader(input.organizationId, input.targetId);
  if (!target) {
    throw new AppError("VALIDATION_ERROR", `Alvo ${input.targetType} não encontrado nesta organização.`);
  }

  const existing = await prisma.documentLink.findFirst({
    where: {
      organizationId: input.organizationId,
      sourceType: "DOCUMENT",
      sourceId: document.id,
      targetType: input.targetType,
      targetId: input.targetId,
      relationType: input.relationType,
    },
  });
  if (existing) {
    throw new AppError("CONFLICT", "Este link já existe.");
  }

  const link = await prisma.$transaction(async (tx) => {
    const created = await tx.documentLink.create({
      data: {
        organizationId: input.organizationId,
        projectId: document.projectId,
        sourceType: "DOCUMENT",
        sourceId: document.id,
        targetType: input.targetType,
        targetId: input.targetId,
        relationType: input.relationType,
        createdBy: input.actorId,
      },
    });
    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        projectId: document.projectId,
        objectType: "Document",
        objectId: document.id,
        action: "LINK",
        newValue: {
          targetType: input.targetType,
          targetId: input.targetId,
          relationType: input.relationType,
        },
        correlationId: input.correlationId ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
    return created;
  });

  return {
    link: {
      id: link.id,
      targetType: link.targetType,
      targetId: link.targetId,
      relationType: link.relationType,
      createdAt: link.createdAt.toISOString(),
    },
  };
}

export async function deleteDocumentLink(
  input: ActorContext & { documentId: string; linkId: string }
) {
  const document = await loadLiveDocument(input.organizationId, input.documentId);
  const link = await prisma.documentLink.findFirst({
    where: {
      id: input.linkId,
      organizationId: input.organizationId,
      sourceType: "DOCUMENT",
      sourceId: document.id,
    },
  });
  if (!link) {
    throw new AppError("NOT_FOUND", "Link não encontrado neste documento.");
  }

  await prisma.documentLink.delete({ where: { id: link.id } });
  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      projectId: document.projectId,
      objectType: "Document",
      objectId: document.id,
      action: "UNLINK",
      oldValue: {
        targetType: link.targetType,
        targetId: link.targetId,
        relationType: link.relationType,
      },
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });

  return { linkId: link.id };
}
