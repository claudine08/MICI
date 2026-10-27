import { z } from "zod";
import {
  CONSTRAINT_TYPES,
  DIARY_ACTIONS,
  FIELD_PRIORITIES,
  PROGRESS_METHODS,
  TASK_ACTIONS,
  CONSTRAINT_ACTIONS,
} from "@/modules/field/engine";

// Campo (E12, §38): validações de entrada mobile-first — poucos campos,
// textos livres curtos e datas em AAAA-MM-DD.

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD).");

const fieldCode = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Código inválido (A–Z, 0–9, . _ -).");

const longText = z.string().trim().max(4000);
const noteText = z.string().trim().max(1000);
const priority = z.enum(FIELD_PRIORITIES);

export const diaryActionSchema = z.enum(DIARY_ACTIONS);
export const taskActionSchema = z.enum(TASK_ACTIONS);
export const constraintActionSchema = z.enum(CONSTRAINT_ACTIONS);
export const constraintTypeSchema = z.enum(CONSTRAINT_TYPES);
export const fieldPrioritySchema = z.enum(FIELD_PRIORITIES);
export const progressMethodValueSchema = z.enum(PROGRESS_METHODS);

// UUID idempotente gerado pelo cliente (§38 Offline: toda operação offline
// possui UUID idempotente — reenvio devolve o registro já criado).
const clientUuid = z.string().uuid().optional();

// ---------------------------------------------------------------------------
// Diário de obra (§26)
// ---------------------------------------------------------------------------

export const createDiarySchema = z.object({
  code: fieldCode.optional(),
  entryDate: isoDate,
  team: z.string().trim().max(300).optional(),
  workHours: z.number().min(0).max(24 * 30).optional(),
  activities: longText.optional(),
  progressNotes: longText.optional(),
  equipment: longText.optional(),
  materials: longText.optional(),
  occurrences: longText.optional(),
  constraintNotes: longText.optional(),
  conditions: longText.optional(),
  inspections: longText.optional(),
  safety: longText.optional(),
  visitors: longText.optional(),
  decisions: longText.optional(),
  water: z.number().min(0).optional(),
  energy: z.number().min(0).optional(),
  wasteNotes: longText.optional(),
  clientUuid,
});

export const updateDiarySchema = createDiarySchema.partial().omit({ code: true, clientUuid: true });

export const diaryTransitionSchema = z.object({
  action: diaryActionSchema,
  reason: noteText.optional(),
});

// ---------------------------------------------------------------------------
// Tarefa de campo (E12-US03)
// ---------------------------------------------------------------------------

export const createTaskSchema = z.object({
  code: fieldCode.optional(),
  title: z.string().trim().min(1).max(200),
  description: longText.optional(),
  priority: priority.default("MEDIUM"),
  assigneeId: z.string().uuid().nullable().optional(),
  dueDate: isoDate.optional(),
  wbsNodeId: z.string().uuid().nullable().optional(),
  activityId: z.string().uuid().nullable().optional(),
  diaryId: z.string().uuid().nullable().optional(),
  clientUuid,
});

export const updateTaskSchema = createTaskSchema.partial().omit({ code: true, clientUuid: true });

export const taskTransitionSchema = z.object({
  action: taskActionSchema,
  reason: noteText.optional(),
});

// ---------------------------------------------------------------------------
// Restrição (E12-US05, §39)
// ---------------------------------------------------------------------------

export const createConstraintSchema = z.object({
  code: fieldCode.optional(),
  title: z.string().trim().min(1).max(200),
  description: longText.optional(),
  type: constraintTypeSchema.default("EXTERNAL"),
  priority: priority.default("MEDIUM"),
  ownerId: z.string().uuid().nullable().optional(),
  dueDate: isoDate.optional(),
  wbsNodeId: z.string().uuid().nullable().optional(),
  activityId: z.string().uuid().nullable().optional(),
  clientUuid,
});

export const updateConstraintSchema = createConstraintSchema
  .partial()
  .omit({ code: true, clientUuid: true });

export const constraintTransitionSchema = z.object({
  action: constraintActionSchema,
  reason: noteText.optional(),
  resolution: longText.optional(),
});

// ---------------------------------------------------------------------------
// Foto de evidência (E12-US02) — metadados do multipart; binário no storage.
// ---------------------------------------------------------------------------

export const uploadPhotoFieldsSchema = z.object({
  code: fieldCode.optional(),
  caption: z.string().trim().max(300).optional(),
  takenAt: z.string().datetime({ offset: true }).optional(),
  diaryId: z.string().uuid().nullable().optional(),
  wbsNodeId: z.string().uuid().nullable().optional(),
  activityId: z.string().uuid().nullable().optional(),
  // Evidência de inspeção (E13-US02, §33): foto pode servir de prova de
  // resultado — PASS/FAIL da inspeção exige foto ou checklist concluído.
  inspectionId: z.string().uuid().nullable().optional(),
  clientUuid,
});

export const updatePhotoSchema = z.object({
  caption: z.string().trim().max(300).optional(),
  takenAt: z.string().datetime({ offset: true }).nullable().optional(),
  diaryId: z.string().uuid().nullable().optional(),
  wbsNodeId: z.string().uuid().nullable().optional(),
  activityId: z.string().uuid().nullable().optional(),
});

// ---------------------------------------------------------------------------
// Medição de avanço físico (E12-US04, BR-006, critério de sucesso 6)
// ---------------------------------------------------------------------------

export const createProgressSchema = z.object({
  code: fieldCode.optional(),
  measurementDate: isoDate,
  wbsNodeId: z.string().uuid().nullable().optional(),
  activityId: z.string().uuid().nullable().optional(),
  method: progressMethodValueSchema.default("PHYSICAL"),
  progressPercent: z.number().min(0).max(100),
  quantityPlanned: z.number().min(0).optional(),
  quantityReal: z.number().min(0).optional(),
  unit: z.string().trim().max(16).optional(),
  // BR-006 / critério de sucesso 6: avanço físico exige critério explícito.
  criterion: z.string().trim().min(1).max(1000),
  notes: longText.optional(),
  clientUuid,
});

export const updateProgressSchema = createProgressSchema
  .partial()
  .omit({ code: true, clientUuid: true });
