import { z } from "zod";
import {
  CHANGE_ACTIONS,
  CHANGE_DIMENSIONS,
  CHANGE_STATUSES,
  IMPACT_SEVERITIES,
} from "@/modules/change/engine";

// Mudanças (E11, §31): validações de entrada. Datas em AAAA-MM-DD; impacto
// consolidado em custo (delta BRL) e prazo (dias corridos).

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD).");

const changeCode = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Código inválido (A–Z, 0–9, . _ -).");

const longText = z.string().trim().max(4000);

export const changeDimensionSchema = z.enum(CHANGE_DIMENSIONS);
export const impactSeveritySchema = z.enum(IMPACT_SEVERITIES);
export const changeActionSchema = z.enum(CHANGE_ACTIONS);
export const changeStatusSchema = z.enum(CHANGE_STATUSES);

export const createChangeSchema = z.object({
  code: changeCode.optional(),
  title: z.string().trim().min(1).max(200),
  description: longText.optional(),
  justification: longText.optional(),
  category: changeDimensionSchema.default("SCOPE"),
  ownerId: z.string().uuid().nullable().optional(),
  dueDate: isoDate.optional(),
  costDelta: z.number().multipleOf(0.01).optional(),
  scheduleDays: z.number().int().optional(),
});

export const updateChangeSchema = createChangeSchema.partial();

// Transição de status (POST /changes/[id]/status): campos contextuais por
// ação (motivo de rejeição/cancelamento, notas de implementação, vínculo de
// baselines na implementação — BR-005).
export const changeTransitionSchema = z.object({
  action: changeActionSchema,
  reason: z.string().trim().max(2000).optional(),
  implementationNotes: z.string().trim().max(4000).optional(),
  baselineIds: z.array(z.string().uuid()).max(10).optional(),
});

// Avaliação de impacto por dimensão (ChangeImpact): upsert por dimensão.
export const upsertChangeImpactSchema = z.object({
  dimension: changeDimensionSchema,
  severity: impactSeveritySchema,
  notes: z.string().trim().max(2000).optional(),
});
