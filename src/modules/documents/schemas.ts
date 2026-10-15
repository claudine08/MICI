import { z } from "zod";

// Documentos (E09, §36): validações de entrada. Upload usa multipart
// (FormData) — o arquivo é validado em storage.ts; aqui ficam os metadados.

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD).");

const documentCode = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Código inválido (A–Z, 0–9, . _ -).");

export const createDocumentSchema = z.object({
  code: documentCode.optional(),
  title: z.string().trim().min(1).max(300),
  discipline: z.string().trim().max(64).optional(),
  classification: z.string().trim().max(64).optional(),
  expiryDate: isoDate.optional(),
});

export const updateDocumentSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  discipline: z.string().trim().max(64).optional(),
  classification: z.string().trim().max(64).optional(),
  expiryDate: isoDate.nullable().optional(),
});

// Upload inicial (multipart): metadados do documento + arquivo.
export const uploadDocumentFieldsSchema = z.object({
  code: documentCode.optional(),
  title: z.string().trim().min(1).max(300),
  discipline: z.string().trim().max(64).optional(),
  classification: z.string().trim().max(64).optional(),
  expiryDate: isoDate.optional(),
});

// Nova revisão (multipart): motivo obrigatório (rastreabilidade §36).
export const revisionFieldsSchema = z.object({
  reason: z.string().trim().min(1).max(300),
});

export const approveDocumentSchema = z.object({
  comment: z.string().trim().max(500).optional(),
});

export const rejectDocumentSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const releaseDocumentSchema = z.object({
  effectiveDate: isoDate.optional(),
  comment: z.string().trim().max(500).optional(),
});

export const obsoleteDocumentSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

// Link genérico (E09-US05, §92).
export const linkRelationTypes = [
  "SATISFIES",
  "EVIDENCES",
  "IMPLEMENTS",
  "IMPACTS",
  "DEPENDS_ON",
  "RELATED_TO",
  "GENERATED_BY",
  "SUPERSEDES",
] as const;

export const linkTargetTypes = [
  "REQUIREMENT",
  "WBS_NODE",
  "SCHEDULE_ACTIVITY",
  "COST_ITEM",
  "DOCUMENT",
] as const;

export const createDocumentLinkSchema = z.object({
  targetType: z.enum(linkTargetTypes),
  targetId: z.string().uuid(),
  relationType: z.enum(linkRelationTypes),
});
