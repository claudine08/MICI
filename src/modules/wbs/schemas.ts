import { z } from "zod";

// Validações da WBS (E05, §74).

export const wbsNodeTypeSchema = z.enum(["SUMMARY", "DELIVERABLE", "WORK_PACKAGE"]);

export const wbsCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Código inválido (A–Z, 0–9, . _ -).");

export const createWbsNodeSchema = z.object({
  code: wbsCodeSchema.optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  nodeType: wbsNodeTypeSchema.optional(),
  parentId: z.string().uuid().nullable().optional(),
  orderIndex: z.number().int().min(0).optional(),
});

// parentId ausente → mantém o pai atual; null → move para a raiz.
export const updateWbsNodeSchema = z.object({
  code: wbsCodeSchema.optional(),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  nodeType: wbsNodeTypeSchema.optional(),
  parentId: z.string().uuid().nullable().optional(),
});

export const reorderWbsSchema = z.object({
  parentId: z.string().uuid().nullable().optional(),
  orderedIds: z.array(z.string().uuid()).min(1),
});

export const wbsImportNodeSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  nodeType: wbsNodeTypeSchema.optional(),
  parentCode: z.string().trim().max(32).nullable().optional(),
  orderIndex: z.number().int().min(0).optional(),
});

export const importWbsSchema = z.object({
  nodes: z.array(wbsImportNodeSchema).min(1),
  note: z.string().trim().max(300).optional(),
});

export const createWbsVersionSchema = z.object({
  note: z.string().trim().max(300).optional(),
});
