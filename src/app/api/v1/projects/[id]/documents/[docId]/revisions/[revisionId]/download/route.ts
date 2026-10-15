import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { downloadRevision } from "@/modules/documents/downloads";

async function idsFrom(context: unknown): Promise<{ docId: string; revisionId: string }> {
  const { docId, revisionId } = await (context as {
    params: Promise<{ docId: string; revisionId: string }>;
  }).params;
  if (!docId || !revisionId) {
    throw new AppError("VALIDATION_ERROR", "Id do documento ou da revisão ausente.");
  }
  return { docId, revisionId };
}

// Download da revisão (§120): authz DOCUMENT:VIEW + AuditEvent de DOWNLOAD.
export const { GET } = apiHandler({
  GET: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "DOCUMENT", "VIEW");
    const { docId, revisionId } = await idsFrom(context);

    const file = await downloadRevision({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      documentId: docId,
      revisionId,
    });

    const safeName = file.fileName.replace(/["\\]/g, "_");
    return new Response(new Uint8Array(file.content), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.sizeBytes),
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "X-Content-Hash": file.hash,
      },
    });
  },
});
