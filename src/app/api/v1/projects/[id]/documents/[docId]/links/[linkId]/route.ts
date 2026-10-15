import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { deleteDocumentLink } from "@/modules/documents/links";

async function idsFrom(context: unknown): Promise<{ docId: string; linkId: string }> {
  const { docId, linkId } = await (context as {
    params: Promise<{ docId: string; linkId: string }>;
  }).params;
  if (!docId || !linkId) {
    throw new AppError("VALIDATION_ERROR", "Id do documento ou do link ausente.");
  }
  return { docId, linkId };
}

// Remove um link do documento (DOCUMENT:EDIT).
export const { DELETE } = apiHandler({
  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "DOCUMENT", "EDIT");
    const { docId, linkId } = await idsFrom(context);

    const result = await deleteDocumentLink({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      documentId: docId,
      linkId,
    });
    return Response.json(result);
  },
});
