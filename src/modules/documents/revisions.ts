import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { loadLiveDocument, getDocumentDetail } from "@/modules/documents/selectors";
import { canCreateRevision, nextRevisionNumber } from "@/modules/documents/engine";
import { type FilePayload } from "@/modules/documents/storage";

// Nova revisão (E09-US02, BR-009): o arquivo corrente nunca é sobrescrito —
// a revisão nova entra em linha própria com hash/autor/data/motivo e o
// documento volta a WIP para percorrer SUBMIT→APPROVE→RELEASE de novo.

interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

export interface CreateRevisionInput {
  documentId: string;
  reason: string;
  file: FilePayload;
}

export async function createRevision(input: ActorContext & CreateRevisionInput) {
  const document = await loadLiveDocument(input.organizationId, input.documentId);

  if (!canCreateRevision(document.status)) {
    throw new AppError(
      "DOCUMENT_INVALID_STATE",
      `Nova revisão permitida apenas em APPROVED, RELEASED_FOR_EXECUTION ou OBSOLETE — atual: ${document.status}.`,
      { details: { currentStatus: document.status } }
    );
  }

  const file = input.file;
  const revisionNumber = nextRevisionNumber(document.currentRevision);

  await prisma.$transaction(async (tx) => {
    await tx.documentRevision.create({
      data: {
        organizationId: input.organizationId,
        documentId: document.id,
        revision: revisionNumber,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        hash: file.hash,
        content: new Uint8Array(file.content),
        reason: input.reason.trim(),
        status: "WIP",
        createdBy: input.actorId,
      },
    });
    await tx.document.update({
      where: { id: document.id },
      data: {
        currentRevision: revisionNumber,
        status: "WIP",
        effectiveDate: null,
        updatedBy: input.actorId,
        version: { increment: 1 },
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
        action: "NEW_REVISION",
        oldValue: { revision: document.currentRevision, status: document.status },
        newValue: { revision: revisionNumber, fileName: file.fileName, hash: file.hash },
        reason: input.reason.trim(),
        correlationId: input.correlationId ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
    await tx.domainEvent.create({
      data: {
        organizationId: input.organizationId,
        projectId: document.projectId,
        actorId: input.actorId,
        eventType: "Document.RevisionCreated",
        aggregateType: "Document",
        aggregateId: document.id,
        payload: { revision: revisionNumber, hash: file.hash },
      },
    });
  });

  return getDocumentDetail(input.organizationId, document.id);
}
