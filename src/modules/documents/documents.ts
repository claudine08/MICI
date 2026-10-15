import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import {
  assertDocumentProject,
  loadLiveDocument,
  type DocumentRow,
  type DocumentDetailRow,
  getDocumentDetail,
} from "@/modules/documents/selectors";
import {
  nextDocumentStatus,
  canEditMetadata,
  canDeleteDocument,
  type DocumentAction,
} from "@/modules/documents/engine";
import { type FilePayload } from "@/modules/documents/storage";

// Documentos (E09, §36): criação com upload inicial, edição de metadados,
// exclusão lógica e transições SUBMIT/APPROVE/REJECT/RELEASE/OBSOLETE.
// Toda aprovação/liberação gera AuditEvent (BR-011) + DocumentApproval.

interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

async function nextDocumentCode(projectId: string): Promise<string> {
  const codes = await prisma.document.findMany({
    where: { projectId },
    select: { code: true },
  });
  let max = 0;
  for (const { code } of codes) {
    const match = /^DOC(\d+)$/.exec(code);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `DOC${String(max + 1).padStart(3, "0")}`;
}

function parseExpiry(value: string | undefined): Date | null {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

export interface CreateDocumentInput {
  projectId: string;
  code?: string;
  title: string;
  discipline?: string;
  classification?: string;
  expiryDate?: string;
  file: FilePayload;
}

// E09-US01 Upload: documento + revisão 1 em uma transação. O binário passa
// por prepareFileUpload (SHA-256, MIME allowlist, limite de tamanho).
export async function createDocument(input: ActorContext & CreateDocumentInput) {
  await assertDocumentProject(input.organizationId, input.projectId);

  let code = input.code?.trim();
  if (code) {
    const existing = await prisma.document.findFirst({
      where: { projectId: input.projectId, code },
      select: { id: true },
    });
    if (existing) {
      throw new AppError("CONFLICT", `Código de documento "${code}" já existe no projeto.`);
    }
  } else {
    code = await nextDocumentCode(input.projectId);
  }

  const file = input.file;

  const document = await prisma.$transaction(async (tx) => {
    const created = await tx.document.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        code,
        title: input.title.trim(),
        discipline: input.discipline?.trim() || null,
        classification: input.classification?.trim() || null,
        expiryDate: parseExpiry(input.expiryDate),
        currentRevision: 1,
        createdBy: input.actorId,
        updatedBy: input.actorId,
      },
    });
    await tx.documentRevision.create({
      data: {
        organizationId: input.organizationId,
        documentId: created.id,
        revision: 1,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        hash: file.hash,
        content: new Uint8Array(file.content),
        status: "WIP",
        createdBy: input.actorId,
      },
    });
    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        projectId: input.projectId,
        objectType: "Document",
        objectId: created.id,
        action: "CREATE",
        newValue: { code, title: created.title, fileName: file.fileName, hash: file.hash },
        correlationId: input.correlationId ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
    await tx.domainEvent.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        actorId: input.actorId,
        eventType: "Document.Created",
        aggregateType: "Document",
        aggregateId: created.id,
        payload: { code, title: created.title },
      },
    });
    return created;
  });

  return getDocumentDetail(input.organizationId, document.id);
}

export interface UpdateDocumentInput {
  documentId: string;
  title?: string;
  discipline?: string;
  classification?: string;
  expiryDate?: string | null;
}

export async function updateDocument(input: ActorContext & UpdateDocumentInput) {
  const document = await loadLiveDocument(input.organizationId, input.documentId);
  if (!canEditMetadata(document.status)) {
    throw new AppError(
      "DOCUMENT_IMMUTABLE",
      `Documento em "${document.status}" não permite edição de metadados; crie uma nova revisão.`
    );
  }

  const updated = await prisma.document.update({
    where: { id: document.id },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.discipline !== undefined ? { discipline: input.discipline.trim() || null } : {}),
      ...(input.classification !== undefined
        ? { classification: input.classification.trim() || null }
        : {}),
      ...(input.expiryDate !== undefined
        ? { expiryDate: input.expiryDate ? parseExpiry(input.expiryDate) : null }
        : {}),
      updatedBy: input.actorId,
      version: { increment: 1 },
    },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      projectId: document.projectId,
      objectType: "Document",
      objectId: document.id,
      action: "UPDATE",
      oldValue: { title: document.title },
      newValue: { title: updated.title },
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });

  return getDocumentDetail(input.organizationId, document.id);
}

// BR-010: exclusão lógica; aprovado/liberado não pode ser apagado (obsoleto).
export async function deleteDocument(input: ActorContext & { documentId: string }) {
  const document = await loadLiveDocument(input.organizationId, input.documentId);
  if (!canDeleteDocument(document.status)) {
    throw new AppError(
      "DOCUMENT_IMMUTABLE",
      `Documento "${document.status}" não pode ser excluído; marque como OBSOLETE.`
    );
  }

  await prisma.document.update({
    where: { id: document.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      projectId: document.projectId,
      objectType: "Document",
      objectId: document.id,
      action: "DELETE",
      oldValue: { code: document.code, title: document.title, status: document.status },
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });

  return { documentId: document.id };
}

export interface TransitionDocumentInput {
  documentId: string;
  action: DocumentAction;
  comment?: string;
  reason?: string;
  effectiveDate?: string;
}

// Transições da máquina §36. APPROVE/REJECT/RELEASE gravam DocumentApproval
// e AuditEvent (BR-011); RELEASE emite domain event Document.Released (§53).
export async function transitionDocument(input: ActorContext & TransitionDocumentInput) {
  const document = await loadLiveDocument(input.organizationId, input.documentId);
  const to = nextDocumentStatus(input.action, document.status);
  if (!to) {
    throw new AppError(
      "DOCUMENT_INVALID_STATE",
      `Transição inválida: ${document.status} não aceita ${input.action}.`,
      { details: { action: input.action, currentStatus: document.status } }
    );
  }

  const now = new Date();
  const comment = input.comment?.trim() || null;
  const reason = input.reason?.trim() || null;

  if ((input.action === "REJECT" || input.action === "OBSOLETE") && !reason) {
    throw new AppError(
      "VALIDATION_ERROR",
      input.action === "REJECT" ? "Rejeição exige um motivo." : "Obsolescência exige um motivo."
    );
  }

  const currentRevision = await prisma.documentRevision.findFirst({
    where: { documentId: document.id, revision: document.currentRevision },
    select: { id: true },
  });

  const updated = await prisma.$transaction(async (tx) => {
    const data: Record<string, unknown> = { status: to, updatedBy: input.actorId, version: { increment: 1 } };
    if (input.action === "RELEASE") {
      data.effectiveDate = input.effectiveDate
        ? parseExpiry(input.effectiveDate)
        : (document.effectiveDate ?? now);
    }
    const doc = await tx.document.update({ where: { id: document.id }, data });

    const revisionData: Record<string, unknown> = { status: to };
    if (input.action === "APPROVE") {
      revisionData.approvedBy = input.actorId;
      revisionData.approvedAt = now;
      revisionData.approvalComment = comment;
    }
    if (currentRevision) {
      await tx.documentRevision.update({ where: { id: currentRevision.id }, data: revisionData });
    }

    if (input.action === "APPROVE" || input.action === "REJECT" || input.action === "RELEASE") {
      if (!currentRevision) {
        throw new AppError("VALIDATION_ERROR", "Documento sem revisão corrente.");
      }
      await tx.documentApproval.create({
        data: {
          organizationId: input.organizationId,
          documentId: document.id,
          revisionId: currentRevision.id,
          action: input.action === "RELEASE" ? "RELEASE" : input.action,
          comment: comment ?? reason,
          createdBy: input.actorId,
        },
      });
    }

    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        projectId: document.projectId,
        objectType: "Document",
        objectId: document.id,
        action: input.action,
        oldValue: { status: document.status },
        newValue: { status: doc.status, ...(comment ? { comment } : {}), ...(reason ? { reason } : {}) },
        reason: comment ?? reason,
        correlationId: input.correlationId ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });

    if (input.action === "RELEASE") {
      await tx.domainEvent.create({
        data: {
          organizationId: input.organizationId,
          projectId: document.projectId,
          actorId: input.actorId,
          eventType: "Document.Released",
          aggregateType: "Document",
          aggregateId: document.id,
          payload: { code: document.code, revision: document.currentRevision },
        },
      });
    }

    return doc;
  });

  void updated;
  return getDocumentDetail(input.organizationId, document.id);
}

export type { DocumentRow, DocumentDetailRow };
