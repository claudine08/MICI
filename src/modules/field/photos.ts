import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import {
  assertCodeFree,
  assertFieldLinks,
  audit,
  emitDomainEvent,
  findByIdempotentKey,
  nextFieldCode,
  type ActorContext,
} from "@/modules/field/common";
import { assertFieldProject } from "@/modules/field/selectors";
import { prepareFileUpload, type FilePayload } from "@/modules/documents/storage";

// Foto de evidência (E12-US02, §33/§61): mesmo storage dos documentos
// (bytea + SHA-256 + limite 4 MB), mas com allowlist restrita a imagem —
// a spec §38 pede "câmera rápida" e upload assíncrono.

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

// Valida o arquivo como imagem (reutiliza tamanho/hash do storage de docs).
export function preparePhotoUpload(file: {
  name: string;
  type: string;
  size: number;
  buffer: Buffer;
}): FilePayload {
  const payload = prepareFileUpload(file);
  if (!ALLOWED_IMAGE_MIME_TYPES.has(payload.mimeType)) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Tipo de arquivo não permitido para foto: ${payload.mimeType || "desconhecido"}.`,
      { details: { allowed: [...ALLOWED_IMAGE_MIME_TYPES] } }
    );
  }
  return payload;
}

export interface CreatePhotoInput {
  projectId: string;
  code?: string;
  clientUuid?: string;
  caption?: string;
  takenAt?: string;
  diaryId?: string | null;
  wbsNodeId?: string | null;
  activityId?: string | null;
  inspectionId?: string | null;
  file: FilePayload;
}

async function assertDiary(organizationId: string, projectId: string, diaryId: string) {
  const diary = await prisma.fieldDiary.findFirst({
    where: { id: diaryId, organizationId, projectId, deletedAt: null },
    select: { id: true },
  });
  if (!diary) {
    throw new AppError("VALIDATION_ERROR", "Diário inválido para este projeto.");
  }
}

// Vínculo de evidência à inspeção (E13-US02): precisa ser inspeção viva do
// mesmo projeto — é o que sustenta PASS/FAIL (§33 "evidência adequada").
async function assertInspection(organizationId: string, projectId: string, inspectionId: string) {
  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, organizationId, projectId, deletedAt: null },
    select: { id: true },
  });
  if (!inspection) {
    throw new AppError("VALIDATION_ERROR", "Inspeção inválida para este projeto.");
  }
}

export async function createPhoto(input: ActorContext & CreatePhotoInput) {
  await assertFieldProject(input.organizationId, input.projectId);

  // Idempotência offline (§38): reenvio do mesmo UUID devolve o original
  // (sem reprocessar o binário).
  const replay = await findByIdempotentKey(input.projectId, input.clientUuid, (where) =>
    prisma.photoEvidence.findFirst({ where, select: { id: true } })
  );
  if (replay) {
    return prisma.photoEvidence.findFirstOrThrow({ where: { id: replay.id } });
  }

  await assertFieldLinks(input.organizationId, input.projectId, {
    wbsNodeId: input.wbsNodeId,
    activityId: input.activityId,
  });
  if (input.diaryId) await assertDiary(input.organizationId, input.projectId, input.diaryId);
  if (input.inspectionId) {
    await assertInspection(input.organizationId, input.projectId, input.inspectionId);
  }

  let code = input.code?.trim();
  if (code) {
    await assertCodeFree(
      input.projectId,
      code,
      (where) => prisma.photoEvidence.findFirst({ where, select: { id: true } }),
      "de foto"
    );
  } else {
    code = await nextFieldCode(input.projectId, "PH");
  }

  const photo = await prisma.photoEvidence.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      diaryId: input.diaryId ?? null,
      code,
      caption: input.caption?.trim() || null,
      fileName: input.file.fileName,
      mimeType: input.file.mimeType,
      sizeBytes: input.file.sizeBytes,
      hash: input.file.hash,
      content: new Uint8Array(input.file.content),
      takenAt: input.takenAt ? new Date(input.takenAt) : null,
      wbsNodeId: input.wbsNodeId ?? null,
      activityId: input.activityId ?? null,
      inspectionId: input.inspectionId ?? null,
      clientUuid: input.clientUuid ?? null,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });

  await audit(input, input.projectId, "PhotoEvidence", "CREATE", {
    objectId: photo.id,
    newValue: { code: photo.code, fileName: photo.fileName, sizeBytes: photo.sizeBytes },
  });
  await emitDomainEvent(input, input.projectId, "PhotoEvidence.Captured", "PhotoEvidence", photo.id, {
    code: photo.code,
    mimeType: photo.mimeType,
    diaryId: photo.diaryId,
  });

  return photo;
}

export async function updatePhoto(
  input: ActorContext & {
    photoId: string;
    caption?: string;
    takenAt?: string | null;
    diaryId?: string | null;
    wbsNodeId?: string | null;
    activityId?: string | null;
  }
) {
  const photo = await prisma.photoEvidence.findFirst({
    where: { id: input.photoId, organizationId: input.organizationId, deletedAt: null },
  });
  if (!photo) {
    throw new AppError("NOT_FOUND", "Foto não encontrada nesta organização.");
  }

  if (input.diaryId) await assertDiary(input.organizationId, photo.projectId, input.diaryId);
  await assertFieldLinks(input.organizationId, photo.projectId, {
    wbsNodeId: input.wbsNodeId,
    activityId: input.activityId,
  });

  const data: Record<string, unknown> = {};
  if (input.caption !== undefined) data.caption = input.caption.trim() || null;
  if (input.takenAt !== undefined) data.takenAt = input.takenAt ? new Date(input.takenAt) : null;
  if (input.diaryId !== undefined) data.diaryId = input.diaryId;
  if (input.wbsNodeId !== undefined) data.wbsNodeId = input.wbsNodeId;
  if (input.activityId !== undefined) data.activityId = input.activityId;

  const updated = await prisma.photoEvidence.update({
    where: { id: photo.id },
    data: { ...data, updatedBy: input.actorId, version: { increment: 1 } },
  });

  await audit(input, photo.projectId, "PhotoEvidence", "UPDATE", {
    objectId: photo.id,
    oldValue: {
      caption: photo.caption,
      diaryId: photo.diaryId,
      wbsNodeId: photo.wbsNodeId,
      activityId: photo.activityId,
    },
    newValue: {
      caption: updated.caption,
      diaryId: updated.diaryId,
      wbsNodeId: updated.wbsNodeId,
      activityId: updated.activityId,
    },
  });

  return updated;
}

export async function deletePhoto(input: ActorContext & { photoId: string }) {
  const photo = await prisma.photoEvidence.findFirst({
    where: { id: input.photoId, organizationId: input.organizationId, deletedAt: null },
  });
  if (!photo) {
    throw new AppError("NOT_FOUND", "Foto não encontrada nesta organização.");
  }

  await prisma.photoEvidence.update({
    where: { id: photo.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId },
  });
  await audit(input, photo.projectId, "PhotoEvidence", "DELETE", {
    objectId: photo.id,
    oldValue: { code: photo.code, fileName: photo.fileName },
  });
  await emitDomainEvent(input, photo.projectId, "PhotoEvidence.Deleted", "PhotoEvidence", photo.id, {
    code: photo.code,
  });

  return { photoId: photo.id };
}
