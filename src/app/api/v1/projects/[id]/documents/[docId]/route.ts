import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getDocumentDetail } from "@/modules/documents/selectors";
import { updateDocument, deleteDocument } from "@/modules/documents/documents";
import { updateDocumentSchema } from "@/modules/documents/schemas";

async function docIdFrom(context: unknown): Promise<string> {
  const { docId } = await (context as { params: Promise<{ docId: string }> }).params;
  if (!docId) throw new AppError("VALIDATION_ERROR", "Id do documento ausente.");
  return docId;
}

function actorOf(tenant: Awaited<ReturnType<typeof requireTenantContext>>, request: NextRequest) {
  return {
    organizationId: tenant.organizationId,
    actorId: tenant.userId,
    actorLabel: tenant.userEmail,
    correlationId: request.headers.get("x-correlation-id") ?? undefined,
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
  };
}

// Documento individual (E09 §36): GET detalhe com revisões e links
// (DOCUMENT:VIEW), PATCH edita metadados (DOCUMENT:EDIT), DELETE exclusão
// lógica (DOCUMENT:DELETE) — BR-010 bloqueia aprovado/liberado.
export const { GET, PATCH, DELETE } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "DOCUMENT", "VIEW");
    const docId = await docIdFrom(context);
    const document = await getDocumentDetail(tenant.organizationId, docId);
    return Response.json({ document });
  },

  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "DOCUMENT", "EDIT");
    const docId = await docIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = updateDocumentSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados inválidos.", { details: parsed.error.flatten() });
    }

    const document = await updateDocument({
      ...actorOf(tenant, request),
      documentId: docId,
      ...parsed.data,
    });
    return Response.json({ document });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "DOCUMENT", "DELETE");
    const docId = await docIdFrom(context);
    const result = await deleteDocument({ ...actorOf(tenant, request), documentId: docId });
    return Response.json(result);
  },
});
