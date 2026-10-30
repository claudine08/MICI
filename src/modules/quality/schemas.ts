import { z } from "zod";
import {
  CHECKLIST_EXECUTION_ACTIONS,
  CHECKLIST_ITEM_RESULTS,
  CORRECTIVE_ACTION_ACTIONS,
  INSPECTION_ACTIONS,
  NON_CONFORMITY_ACTIONS,
  PUNCH_ITEM_ACTIONS,
} from "@/modules/quality/engine";
import { FIELD_PRIORITIES } from "@/modules/field/engine";

// Qualidade (E13, §33): validações de entrada — checklist (modelo e
// execução) e inspeção. Mesmo estilo do módulo de campo.

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD).");

const qualityCode = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Código inválido (A–Z, 0–9, . _ -).");

const longText = z.string().trim().max(4000);
const noteText = z.string().trim().max(1000);

const clientUuid = z.string().uuid().optional();

export const checklistItemResultValueSchema = z.enum(CHECKLIST_ITEM_RESULTS);
export const checklistExecutionActionSchema = z.enum(CHECKLIST_EXECUTION_ACTIONS);
export const inspectionActionSchema = z.enum(INSPECTION_ACTIONS);
export const nonConformityActionSchema = z.enum(NON_CONFORMITY_ACTIONS);
export const correctiveActionActionSchema = z.enum(CORRECTIVE_ACTION_ACTIONS);
export const punchItemActionSchema = z.enum(PUNCH_ITEM_ACTIONS);
export const punchItemPrioritySchema = z.enum(FIELD_PRIORITIES);

// Item de checklist: no modelo é texto + obrigatoriedade; na execução
// ganha o resultado (§33 "atingir o critério").
export const checklistItemSchema = z.object({
  key: z.string().trim().min(1).max(64),
  text: z.string().trim().min(1).max(1000),
  required: z.boolean().default(false),
  result: checklistItemResultValueSchema.nullable().optional(),
  note: noteText.nullable().optional(),
});

export const checklistItemsSchema = z.array(checklistItemSchema).min(1, "Informe ao menos um item.");

// ---------------------------------------------------------------------------
// Modelo de checklist (E13-US01)
// ---------------------------------------------------------------------------

export const createChecklistTemplateSchema = z.object({
  code: qualityCode.optional(),
  name: z.string().trim().min(1).max(200),
  description: longText.optional(),
  items: checklistItemsSchema,
});

export const updateChecklistTemplateSchema = createChecklistTemplateSchema
  .partial()
  .omit({ code: true });

// ---------------------------------------------------------------------------
// Execução de checklist (E13-US01)
// ---------------------------------------------------------------------------

export const createChecklistExecutionSchema = z.object({
  code: qualityCode.optional(),
  templateId: z.string().uuid(),
  inspectionId: z.string().uuid().nullable().optional(),
  inspectorId: z.string().uuid().nullable().optional(),
  notes: longText.optional(),
  clientUuid,
});

// Responder itens só em rascunho — reabre a execução para editar (regra da
// máquina de estados, validada também no writer).
export const updateChecklistExecutionSchema = z.object({
  items: checklistItemsSchema.optional(),
  inspectorId: z.string().uuid().nullable().optional(),
  notes: longText.optional(),
  inspectionId: z.string().uuid().nullable().optional(),
});

export const checklistExecutionTransitionSchema = z.object({
  action: checklistExecutionActionSchema,
  reason: noteText.optional(),
});

// ---------------------------------------------------------------------------
// Inspeção (E13-US02, §33)
// ---------------------------------------------------------------------------

export const createInspectionSchema = z.object({
  code: qualityCode.optional(),
  title: z.string().trim().min(1).max(200),
  description: longText.optional(),
  inspectionDate: isoDate,
  inspectorId: z.string().uuid().nullable().optional(),
  wbsNodeId: z.string().uuid().nullable().optional(),
  activityId: z.string().uuid().nullable().optional(),
  criterion: z.string().trim().min(1).max(4000),
  clientUuid,
});

export const updateInspectionSchema = createInspectionSchema
  .partial()
  .omit({ code: true, clientUuid: true });

export const inspectionTransitionSchema = z.object({
  action: inspectionActionSchema,
  reason: noteText.optional(),
  resultNotes: longText.optional(),
});

// ---------------------------------------------------------------------------
// Não conformidade — NCR (E13-US03, §33)
// ---------------------------------------------------------------------------

export const createNonConformitySchema = z.object({
  code: qualityCode.optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000),
  inspectionId: z.string().uuid().nullable().optional(),
  clientUuid,
});

export const updateNonConformitySchema = createNonConformitySchema
  .partial()
  .omit({ code: true, clientUuid: true });

export const nonConformityTransitionSchema = z.object({
  action: nonConformityActionSchema,
  reason: noteText.optional(),
  correctionNotes: longText.optional(),
  verificationNotes: longText.optional(),
});

// ---------------------------------------------------------------------------
// Ação corretiva (E13-US04)
// ---------------------------------------------------------------------------

export const createCorrectiveActionSchema = z.object({
  code: qualityCode.optional(),
  nonConformityId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000),
  responsibleId: z.string().uuid().nullable().optional(),
  dueDate: isoDate.optional(),
  clientUuid,
});

export const updateCorrectiveActionSchema = createCorrectiveActionSchema
  .partial()
  .omit({ code: true, clientUuid: true, nonConformityId: true });

export const correctiveActionTransitionSchema = z.object({
  action: correctiveActionActionSchema,
  reason: noteText.optional(),
  actionNotes: longText.optional(),
  verificationNotes: longText.optional(),
});

// ---------------------------------------------------------------------------
// Punch list (E13-US05, §34)
// ---------------------------------------------------------------------------

export const createPunchItemSchema = z.object({
  code: qualityCode.optional(),
  location: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(4000),
  priority: punchItemPrioritySchema.optional(),
  ownerId: z.string().uuid().nullable().optional(),
  dueDate: isoDate.optional(),
  wbsNodeId: z.string().uuid().nullable().optional(),
  activityId: z.string().uuid().nullable().optional(),
  photoEvidenceId: z.string().uuid().nullable().optional(),
  clientUuid,
});

export const updatePunchItemSchema = createPunchItemSchema
  .partial()
  .omit({ code: true, clientUuid: true });

// A transição pode carregar o responsável (ASSIGN), a foto da correção
// (SUBMIT) ou a nota de verificação (VERIFY) junto com a ação.
export const punchItemTransitionSchema = z.object({
  action: punchItemActionSchema,
  reason: noteText.optional(),
  ownerId: z.string().uuid().nullable().optional(),
  correctionEvidenceId: z.string().uuid().nullable().optional(),
  verificationNotes: longText.optional(),
});
