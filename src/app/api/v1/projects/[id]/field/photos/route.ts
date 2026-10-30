import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listPhotos } from "@/modules/field/selectors";
import { createPhoto, photoUploadFields, preparePhotoUpload } from "@/modules/field/photos";
import { fileFromFormData } from "@/modules/documents/storage";
import { actorOf, projectIdFrom } from "@/modules/field/http";

// Fotos de evidência (E12-US02, §33/§61):
// GET → metadados (FIELD:VIEW; ?diaryId= filtra por diário).
// POST → upload multipart (FIELD:CREATE) com allowlist só de imagem.
export const { GET, POST } = apiHandler({
  GET: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "VIEW");
    const projectId = await projectIdFrom(context);
    const url = new URL(request.url);
    const diaryId = url.searchParams.get("diaryId") ?? undefined;
    const inspectionId = url.searchParams.get("inspectionId") ?? undefined;
    const photos = await listPhotos(tenant.organizationId, projectId, diaryId, inspectionId);
    return Response.json({ photos });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "CREATE");
    const projectId = await projectIdFrom(context);

    const formData = await request.formData().catch(() => null);
    if (!formData) {
      throw new AppError("VALIDATION_ERROR", "Envie um formulário multipart com a foto.");
    }

    const fields = photoUploadFields(formData);
    const file = await fileFromFormData(formData);
    if (!file) {
      throw new AppError("VALIDATION_ERROR", "Foto ausente (campo `file`).");
    }
    const payload = preparePhotoUpload(file);

    const photo = await createPhoto({
      ...actorOf(tenant, request),
      projectId,
      ...fields,
      file: payload,
    });
    return Response.json({ photo }, { status: 201 });
  },
});
