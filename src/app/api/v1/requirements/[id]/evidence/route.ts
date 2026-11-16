import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { addRequirementEvidence } from "@/modules/requirements/requirements";
import { addRequirementEvidenceSchema } from "@/modules/requirements/schemas";
import { fileFromFormData, prepareFileUpload } from "@/modules/documents/storage";

async function requirementIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do requisito ausente.");
  return id;
}

// Evidências do requisito (E04-US04, BR-008):
// POST → vincula evidência (REQUIREMENT:EDIT). Aceita JSON (label+url) ou
// multipart (label + url + file opcional).

export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "REQUIREMENT", "EDIT");
    const requirementId = await requirementIdFrom(context);

    const contentType = request.headers.get("content-type") ?? "";
    let label = "";
    let url: string | undefined;
    let filePayload: ReturnType<typeof prepareFileUpload> | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData().catch(() => null);
      if (!formData) {
        throw new AppError("VALIDATION_ERROR", "Formulário multipart inválido.");
      }
      label = (formData.get("label")?.toString() ?? "").trim();
      url = formData.get("url")?.toString() || undefined;
      const file = await fileFromFormData(formData);
      if (file) filePayload = prepareFileUpload(file);
    } else {
      const body = await request.json().catch(() => null);
      const parsed = addRequirementEvidenceSchema.safeParse(body);
      if (!parsed.success) {
        throw new AppError("VALIDATION_ERROR", "Dados da evidência inválidos.", {
          details: parsed.error.flatten(),
        });
      }
      label = parsed.data.label;
      url = parsed.data.url;
    }

    if (!label) {
      throw new AppError("VALIDATION_ERROR", "Label da evidência é obrigatório.");
    }

    const result = await addRequirementEvidence({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      requirementId,
      label,
      url,
      file: filePayload,
    });

    return Response.json(result, { status: 201 });
  },
});