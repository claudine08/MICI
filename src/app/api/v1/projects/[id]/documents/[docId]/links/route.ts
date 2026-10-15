import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { createDocumentLink } from "@/modules/documents/links";
import { createDocumentLinkSchema } from "@/modules/documents/schemas";

async function docIdFrom(context: unknown): Promise<string> {
  const { docId } = await (context as { params: Promise<{ docId: string }> }).params;
  if (!docId) throw new AppError("VALIDATION_ERROR", "Id do documento ausente.");
  return docId;
}

// Links do documento (E09-US05, §92): GET já vem no detalhe do documento;
// POST cria um link novo (DOCUMENT:EDIT).
export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "DOCUMENT", "EDIT");
    const docId = await docIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = createDocumentLinkSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Link inválido.", { details: parsed.error.flatten() });
    }

    const { link } = await createDocumentLink({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      documentId: docId,
      ...parsed.data,
    });
    return Response.json({ link }, { status: 201 });
  },
});
