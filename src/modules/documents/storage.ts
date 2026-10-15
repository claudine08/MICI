import { createHash } from "node:crypto";
import { AppError } from "@/core/errors";

// Storage de arquivos de documentos (E09, §61): nesta fase o binário fica no
// Postgres (bytea) — abstração isolada aqui para migrar a S3/Blob sem tocar
// no módulo. Regras de §61: hash SHA-256, MIME validado e limite de tamanho.

// Limite de 4 MB: Vercel serverless limita o corpo da requisição a ~4,5 MB;
// uploads maiores exigirão presigned URL direta ao storage (§118) numa fase
// futura com S3/Blob.
export const MAX_FILE_BYTES = 4 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/zip",
  "text/plain",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
]);

export interface FilePayload {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  hash: string;
  content: Buffer;
}

// Valida tipo/tamanho e devolve o payload persistível (com hash SHA-256).
// Lança VALIDATION_ERROR com a regra violada (§61).
export function prepareFileUpload(file: {
  name: string;
  type: string;
  size: number;
  buffer: Buffer;
}): FilePayload {
  const fileName = file.name.trim();
  if (!fileName) {
    throw new AppError("VALIDATION_ERROR", "Arquivo sem nome.");
  }
  if (file.size === 0) {
    throw new AppError("VALIDATION_ERROR", "Arquivo vazio.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Arquivo excede o limite de ${Math.floor(MAX_FILE_BYTES / (1024 * 1024))} MB.`,
      { details: { maxBytes: MAX_FILE_BYTES, sizeBytes: file.size } }
    );
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new AppError("VALIDATION_ERROR", `Tipo de arquivo não permitido: ${file.type || "desconhecido"}.`, {
      details: { allowed: [...ALLOWED_MIME_TYPES] },
    });
  }

  return {
    fileName: fileName.slice(0, 255),
    mimeType: file.type,
    sizeBytes: file.size,
    hash: createHash("sha256").update(file.buffer).digest("hex"),
    content: file.buffer,
  };
}

// Extrai o arquivo de um FormData multipart. Vercel/Next expõem File com
// arrayBuffer(); convertemos para Buffer para o Prisma Bytes.
export async function fileFromFormData(formData: FormData): Promise<{
  name: string;
  type: string;
  size: number;
  buffer: Buffer;
} | null> {
  const entry = formData.get("file");
  if (!entry || typeof entry === "string") return null;
  const buffer = Buffer.from(await entry.arrayBuffer());
  return { name: entry.name, type: entry.type, size: entry.size, buffer };
}
