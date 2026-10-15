import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";

// Leituras de documentos (E09, §36) — sempre escopadas pelo organization_id.
// O conteúdo (Bytes) só sai em download dedicado, nunca nas listagens.

export async function assertDocumentProject(organizationId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: null },
    select: { id: true, code: true, name: true },
  });
  if (!project) {
    throw new AppError("NOT_FOUND", "Projeto não encontrado nesta organização.");
  }
  return project;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function isoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export type DocumentStatusRow =
  | "WIP"
  | "FOR_REVIEW"
  | "APPROVED"
  | "RELEASED_FOR_EXECUTION"
  | "OBSOLETE";

export interface DocumentRevisionRow {
  id: string;
  revision: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  hash: string;
  reason: string | null;
  status: DocumentStatusRow;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalComment: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface DocumentRow {
  id: string;
  projectId: string;
  code: string;
  title: string;
  discipline: string | null;
  classification: string | null;
  status: DocumentStatusRow;
  currentRevision: number;
  effectiveDate: string | null;
  expiryDate: string | null;
  currentFileName: string | null;
  currentFileSize: number | null;
  currentHash: string | null;
  currentRevisionId: string | null;
  revisionCount: number;
  version: number;
}

export interface DocumentDetailRow extends DocumentRow {
  revisions: DocumentRevisionRow[];
  links: DocumentLinkRow[];
}

export interface DocumentLinkRow {
  id: string;
  targetType: string;
  targetId: string;
  relationType: string;
  createdAt: string;
}

async function loadLiveDocument(organizationId: string, documentId: string) {
  const document = await prisma.document.findFirst({
    where: { id: documentId, organizationId, deletedAt: null },
  });
  if (!document) {
    throw new AppError("NOT_FOUND", "Documento não encontrado nesta organização.");
  }
  return document;
}

export { loadLiveDocument };

function revisionToRow(row: {
  id: string;
  revision: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  hash: string;
  reason: string | null;
  status: DocumentStatusRow;
  approvedBy: string | null;
  approvedAt: Date | null;
  approvalComment: string | null;
  createdAt: Date;
  createdBy: string | null;
}): DocumentRevisionRow {
  return {
    id: row.id,
    revision: row.revision,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    hash: row.hash,
    reason: row.reason,
    status: row.status,
    approvedBy: row.approvedBy,
    approvedAt: iso(row.approvedAt),
    approvalComment: row.approvalComment,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
  };
}

type DocumentWithRevisions = {
  id: string;
  projectId: string;
  code: string;
  title: string;
  discipline: string | null;
  classification: string | null;
  status: DocumentStatusRow;
  currentRevision: number;
  effectiveDate: Date | null;
  expiryDate: Date | null;
  version: number;
  revisions: Array<{
    id: string;
    revision: number;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    hash: string;
    reason: string | null;
    status: DocumentStatusRow;
    approvedBy: string | null;
    approvedAt: Date | null;
    approvalComment: string | null;
    createdAt: Date;
    createdBy: string | null;
  }>;
};

function toRow(document: DocumentWithRevisions): DocumentRow {
  const current =
    document.revisions.find((r) => r.revision === document.currentRevision) ?? null;
  return {
    id: document.id,
    projectId: document.projectId,
    code: document.code,
    title: document.title,
    discipline: document.discipline,
    classification: document.classification,
    status: document.status,
    currentRevision: document.currentRevision,
    effectiveDate: isoDate(document.effectiveDate),
    expiryDate: isoDate(document.expiryDate),
    currentFileName: current?.fileName ?? null,
    currentFileSize: current?.sizeBytes ?? null,
    currentHash: current?.hash ?? null,
    currentRevisionId: current?.id ?? null,
    revisionCount: document.revisions.length,
    version: document.version,
  };
}

const revisionOrderBy = { revision: "desc" } as const;

export async function listDocuments(
  organizationId: string,
  projectId: string
): Promise<DocumentRow[]> {
  await assertDocumentProject(organizationId, projectId);
  const rows = await prisma.document.findMany({
    where: { organizationId, projectId, deletedAt: null },
    include: { revisions: { orderBy: revisionOrderBy, take: 1 } },
    orderBy: { code: "asc" },
  });
  return rows.map(toRow);
}

export async function getDocumentDetail(
  organizationId: string,
  documentId: string
): Promise<DocumentDetailRow> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, organizationId, deletedAt: null },
    include: { revisions: { orderBy: revisionOrderBy } },
  });
  if (!document) {
    throw new AppError("NOT_FOUND", "Documento não encontrado nesta organização.");
  }

  const links = await prisma.documentLink.findMany({
    where: {
      organizationId,
      OR: [
        { sourceType: "DOCUMENT", sourceId: document.id },
        { targetType: "DOCUMENT", targetId: document.id },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    ...toRow(document),
    revisions: document.revisions.map(revisionToRow),
    links: links.map((link) => ({
      id: link.id,
      targetType: link.targetType,
      targetId: link.targetId,
      relationType: link.relationType,
      createdAt: link.createdAt.toISOString(),
    })),
  };
}

export interface DocumentSummaryRow {
  projectId: string;
  documentCount: number;
  releasedCount: number;
  inReviewCount: number;
}

// Resumo por projeto para a visão global /documentos.
export async function listDocumentSummaries(
  organizationId: string
): Promise<DocumentSummaryRow[]> {
  const rows = await prisma.document.groupBy({
    by: ["projectId", "status"],
    where: { organizationId, deletedAt: null },
    _count: { _all: true },
  });

  const byProject = new Map<string, DocumentSummaryRow>();
  for (const row of rows) {
    const entry = byProject.get(row.projectId) ?? {
      projectId: row.projectId,
      documentCount: 0,
      releasedCount: 0,
      inReviewCount: 0,
    };
    entry.documentCount += row._count._all;
    if (row.status === "RELEASED_FOR_EXECUTION") entry.releasedCount += row._count._all;
    if (row.status === "FOR_REVIEW") entry.inReviewCount += row._count._all;
    byProject.set(row.projectId, entry);
  }
  return [...byProject.values()];
}

// Conteúdo binário da revisão para download (§120: somente após auth+authz;
// o audit do download é escrito pelo chamador).
export async function loadRevisionContent(
  organizationId: string,
  documentId: string,
  revisionId: string
) {
  const revision = await prisma.documentRevision.findFirst({
    where: { id: revisionId, documentId, organizationId },
  });
  if (!revision) {
    throw new AppError("NOT_FOUND", "Revisão não encontrada neste documento.");
  }
  return revision;
}
