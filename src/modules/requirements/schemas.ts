import { z } from "zod";

// Validações de requisitos e DRP (E04, §20, BR-008, BR-015).
// Datas em formato ISO (YYYY-MM-DD).

const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Código inválido (A–Z, 0–9, . _ -).");

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD).");

export const documentLinkSchema = z.object({
  label: z.string().trim().min(1).max(200),
  url: z.string().trim().max(500),
});

const requirementFields = {
  code: codeSchema.optional(),
  description: z.string().trim().min(1).max(4000),
  category: z.enum(["OPERATION", "EQUIPMENT", "BUILDING", "ENGINEERING", "COMPLIANCE", "SUSTAINABILITY"]).optional(),
  source: z.string().trim().max(300).nullable().optional(),
  sourceValidUntil: isoDate.nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  ownerId: z.string().uuid().nullable().optional(),
  acceptanceCriteria: z.string().trim().max(4000).nullable().optional(),
  requiredEvidence: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
  wbsNodeId: z.string().uuid().nullable().optional(),
  documentLinks: z.array(documentLinkSchema).max(50).optional(),
};

export const createRequirementSchema = z.object(requirementFields);

// status é validado pela máquina de estados do domínio (engine.requirementTransition)
export const updateRequirementSchema = z
  .object(requirementFields)
  .partial()
  .extend({ changeSummary: z.string().trim().max(500).optional() });

export const reviewRequirementSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export const addRequirementEvidenceSchema = z.object({
  label: z.string().trim().min(1).max(200),
  url: z.string().trim().max(500).optional(),
});
