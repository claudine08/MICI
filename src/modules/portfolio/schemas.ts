import { z } from "zod";

// Validações do portfólio (E03). Datas em formato ISO (YYYY-MM-DD).

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

const nullableCode = z
  .string()
  .trim()
  .max(32)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Código inválido (A–Z, 0–9, . _ -).");

export const createClientSchema = z.object({
  code: nullableCode.optional(),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().max(320).optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const updateClientSchema = z.object({
  code: nullableCode.nullable().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().max(320).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const createTemplateSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  isDefault: z.boolean().optional(),
});

export const updateTemplateSchema = z.object({
  code: codeSchema.optional(),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  isDefault: z.boolean().optional(),
});

export const createProjectSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional(),
  clientId: z.string().uuid().nullable().optional(),
  projectType: z.string().trim().max(64).optional(),
  location: z.string().trim().max(300).optional(),
  projectTemplateId: z.string().uuid().nullable().optional(),
  projectManagerId: z.string().uuid().nullable().optional(),
  sponsorId: z.string().uuid().nullable().optional(),
  startDate: isoDate.nullable().optional(),
  plannedEndDate: isoDate.nullable().optional(),
  contractEndDate: isoDate.nullable().optional(),
  currency: z.string().trim().length(3).optional(),
  contractValue: z.number().nonnegative().nullable().optional(),
  timezone: z.string().trim().max(64).optional(),
  status: z
    .enum(["DRAFT", "QUALIFICATION", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED", "ARCHIVED"])
    .optional(),
});

// currentPhase NÃO pode ser alterado por PATCH — apenas via /projects/[id]/phase
// (BR-001). Campos desconhecidos são descartados pelo zod.
export const updateProjectSchema = createProjectSchema.partial().omit({ code: true }).extend({
  code: codeSchema.optional(),
});

export const changePhaseSchema = z.object({
  direction: z.enum(["advance", "retreat"]),
});

export const gateDefinitionCriteriaSchema = z.object({
  description: z.string().trim().min(1).max(300),
  required: z.boolean().optional(),
});

export const createGateDefinitionSchema = z.object({
  code: z.string().trim().min(1).max(16),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  phase: z.string().trim().min(1).max(8),
  required: z.boolean().optional(),
  requiresEvidence: z.boolean().optional(),
  minimumApprovals: z.number().int().min(1).max(10).optional(),
  criteria: z.array(gateDefinitionCriteriaSchema).min(1),
});

export const updateGateDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  phase: z.string().trim().min(1).max(8).optional(),
  required: z.boolean().optional(),
  requiresEvidence: z.boolean().optional(),
  minimumApprovals: z.number().int().min(1).max(10).optional(),
  criteria: z.array(gateDefinitionCriteriaSchema).min(1).optional(),
});

export const transitionGateSchema = z.object({
  action: z.enum(["start", "submit", "analyze", "approve", "reject", "waive"]),
  reason: z.string().trim().max(1000).optional(),
});

export const setGateCriteriaSchema = z.object({
  results: z
    .array(
      z.object({
        criterionCode: z.string().trim().min(1).max(32),
        completed: z.boolean(),
        note: z.string().trim().max(500).optional(),
      })
    )
    .min(1),
});

export const addGateEvidenceSchema = z.object({
  label: z.string().trim().min(1).max(200),
  url: z.string().trim().max(500).optional(),
});
