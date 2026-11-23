import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { getResponseLink } from "@/modules/field/response-links";
import { createPhoto, photoUploadFields, preparePhotoUpload } from "@/modules/field/photos";
import { fileFromFormData } from "@/modules/documents/storage";

export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const { token } = await (context as { params: Promise<{ token: string }> }).params;
    const link = await getResponseLink(token);

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

    const actorId = link.createdBy ?? "resposta";
    const photo = await createPhoto({
      organizationId: link.organizationId,
      actorId,
      actorLabel: "Resposta de Campo",
      projectId: link.projectId,
      diaryId: link.entityType === "diary" ? link.entityId : (fields.diaryId ?? null),
      activityId: fields.activityId ?? null,
      wbsNodeId: fields.wbsNodeId ?? null,
      caption: fields.caption,
      takenAt: fields.takenAt,
      file: payload,
    });
    return Response.json({ photo }, { status: 201 });
  },
});