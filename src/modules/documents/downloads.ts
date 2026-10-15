import { prisma } from "@/lib/prisma";
import { loadRevisionContent } from "@/modules/documents/selectors";

// Download de revisão (§120: Authenticate → Authorize → Audit → Download).
// A autorização de leitura (DOCUMENT:VIEW) é feita na rota; aqui ficam a
// carga do binário e o AuditEvent de DOWNLOAD (rastreabilidade §95).

interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

export interface RevisionDownload {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  hash: string;
  content: Buffer;
}

export async function downloadRevision(
  input: ActorContext & { documentId: string; revisionId: string }
): Promise<RevisionDownload> {
  const revision = await loadRevisionContent(
    input.organizationId,
    input.documentId,
    input.revisionId
  );

  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      objectType: "DocumentRevision",
      objectId: revision.id,
      action: "DOWNLOAD",
      newValue: { documentId: input.documentId, revision: revision.revision, hash: revision.hash },
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });

  return {
    fileName: revision.fileName,
    mimeType: revision.mimeType,
    sizeBytes: revision.sizeBytes,
    hash: revision.hash,
    content: Buffer.from(revision.content),
  };
}
