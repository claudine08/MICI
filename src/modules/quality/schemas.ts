import { z } from "zod";
import {
  CHECKLIST_EXECUTION_ACTIONS,
  CHECKLIST_ITEM_RESULTS,
  INSPECTION_ACTIONS,
} from "@/modules/quality/engine";

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
