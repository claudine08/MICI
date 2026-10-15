import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { createRevision } from "@/modules/documents/revisions";
import { revisionFieldsSchema } from "@/modules/documents/schemas";
import { fileFromFormData, prepareFileUpload } from "@/modules/documents/storage";

async function docIdFrom(context: unknown): Promise<string> {
  const { docId } = await (context as { params: Promise<{ docId: string }> }).params;
  if (!docId) throw new AppError("VALIDATION_ERROR", "Id do documento ausente.");
  return docId;
}

// Nova revisão (E09-US02, BR-009): multipart com `file` + `reason`. O arquivo
// corrente nunca é sobrescrito — entra como revisão nova e o documento volta
// a WIP. Permitido só em APPROVED/RELEASED/OBSOLETE (DOCUMENT:EDIT).
export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "DOCUMENT", "EDIT");
    const docId = await docIdFrom(context);

    const formData = await request.formData().catch(() => null);
    if (!formData) {
      throw new AppError("VALIDATION_ERROR", "Envie um formulário multipart com `file` e `reason`.");
    }

    const parsed = revisionFieldsSchema.safeParse({
      reason: formData.get("reason")?.toString() ?? "",
    });
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Revisão inválida.", { details: parsed.error.flatten() });
    }

    const file = await fileFromFormData(formData);
    if (!file) {
      throw new AppError("VALIDATION_ERROR", "Arquivo ausente (campo `file`).");
    }
    const payload = prepareFileUpload(file);

    const document = await createRevision({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      documentId: docId,
      reason: parsed.data.reason,
      file: payload,
    });
    return Response.json({ document }, { status: 201 });
  },
});
