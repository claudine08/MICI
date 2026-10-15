import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listDocuments } from "@/modules/documents/selectors";
import { createDocument } from "@/modules/documents/documents";
import { uploadDocumentFieldsSchema } from "@/modules/documents/schemas";
import { fileFromFormData, prepareFileUpload } from "@/modules/documents/storage";

async function projectIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do projeto ausente.");
  return id;
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

// Documentos do projeto (E09 §36):
// GET → lista documentos vivos (DOCUMENT:VIEW).
// POST → cria documento com upload inicial (multipart, DOCUMENT:CREATE).
export const { GET, POST } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "DOCUMENT", "VIEW");
    const projectId = await projectIdFrom(context);
    const documents = await listDocuments(tenant.organizationId, projectId);
    return Response.json({ documents });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "DOCUMENT", "CREATE");
    const projectId = await projectIdFrom(context);

    const formData = await request.formData().catch(() => null);
    if (!formData) {
      throw new AppError("VALIDATION_ERROR", "Envie um formulário multipart com os metadados e o arquivo.");
    }

    const rawFields = {
      code: formData.get("code")?.toString() || undefined,
      title: formData.get("title")?.toString() || "",
      discipline: formData.get("discipline")?.toString() || undefined,
      classification: formData.get("classification")?.toString() || undefined,
      expiryDate: formData.get("expiryDate")?.toString() || undefined,
    };
    const parsed = uploadDocumentFieldsSchema.safeParse(rawFields);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Documento inválido.", {
        details: parsed.error.flatten(),
      });
    }

    const file = await fileFromFormData(formData);
    if (!file) {
      throw new AppError("VALIDATION_ERROR", "Arquivo ausente (campo `file`).");
    }
    // Validação precoce (MIME/tamanho/hash) antes de tocar o banco.
    const payload = prepareFileUpload(file);

    const document = await createDocument({
      ...actorOf(tenant, request),
      projectId,
      ...parsed.data,
      file: payload,
    });
    return Response.json({ document }, { status: 201 });
  },
});
