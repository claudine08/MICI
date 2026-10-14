import { z } from "zod";

// Validações do cronograma (E07, §27).

export const activityTypeSchema = z.enum(["TASK", "MILESTONE", "SUMMARY"]);

export const activityStatusSchema = z.enum([
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
  "ON_HOLD",
  "CANCELLED",
]);

export const dependencyTypeSchema = z.enum(["FS", "SS", "FF", "SF"]);

export const progressMethodSchema = z.enum(["PERCENT_COMPLETE", "PHYSICAL", "UNITS"]);

export const activityCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Código inválido (A–Z, 0–9, . _ -).");

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD).");

export const createActivitySchema = z.object({
  code: activityCodeSchema.optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  activityType: activityTypeSchema.optional(),
  duration: z.number().int().min(0).max(3650).optional(),
  plannedStart: isoDate.nullable().optional(),
  plannedFinish: isoDate.nullable().optional(),
  wbsNodeId: z.string().uuid().nullable().optional(),
  calendarId: z.string().uuid().nullable().optional(),
  progressMethod: progressMethodSchema.optional(),
  status: activityStatusSchema.optional(),
  orderIndex: z.number().int().min(0).optional(),
});

// Campos ausentes → mantêm o valor atual; null limpa o campo.
export const updateActivitySchema = createActivitySchema
  .partial()
  .omit({ orderIndex: true })
  .extend({});

export const progressSchema = z.object({
  physicalProgress: z.number().int().min(0).max(100),
  status: activityStatusSchema.optional(),
});

export const createDependencySchema = z.object({
  predecessorId: z.string().uuid(),
  successorId: z.string().uuid(),
  type: dependencyTypeSchema.optional(),
  lag: z.number().int().min(-3650).max(3650).optional(),
});

// Baselines (E07-US04, §28).
export const baselineTypeSchema = z.enum(["SCOPE", "SCHEDULE", "COST", "SUSTAINABILITY"]);

export const createBaselineSchema = z.object({
  type: baselineTypeSchema.optional(),
  reason: z.string().trim().max(500).optional(),
});

// DRAFT → SUBMITTED → APPROVED; SUBMITTED → DRAFT (rejeição);
// APPROVED → SUPERSEDED acontece automaticamente ao aprovar uma mais nova.
export const baselineActionSchema = z.object({
  action: z.enum(["SUBMIT", "APPROVE", "REJECT"]),
});

// Calendários (E07-US03, §27): semana de trabalho (0=domingo…6=sábado) e
// feriados em AAAA-MM-DD; escopo por projeto ou por organização.
export const calendarScopeSchema = z.enum(["PROJECT", "ORGANIZATION"]);

export const createCalendarSchema = z.object({
  code: activityCodeSchema,
  name: z.string().trim().min(1).max(120),
  scope: calendarScopeSchema.optional(),
  workingWeek: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .max(7)
    .refine((days) => new Set(days).size === days.length, "Dias repetidos na semana de trabalho.")
    .optional(),
  holidays: z
    .array(isoDate)
    .refine((dates) => new Set(dates).size === dates.length, "Feriado repetido.")
    .optional(),
  isDefault: z.boolean().optional(),
});

// Escopo não muda depois de criado (a unicidade do código é por organização).
export const updateCalendarSchema = createCalendarSchema.partial().omit({ scope: true });

// Importação do cronograma MS Project (E07 import, §27): corpo JSON com o
// texto do arquivo (CSV/XML) ou o id de um template salvo — exatamente um.
const fileContent = z.string().min(1).max(5_000_000, "Arquivo grande demais.");

export const importScheduleSchema = z
  .object({
    filename: z.string().trim().max(200).optional(),
    content: fileContent.optional(),
    templateId: z.string().uuid().optional(),
    calendarId: z.string().uuid().nullable().optional(),
  })
  .refine((data) => Number(Boolean(data.content)) + Number(Boolean(data.templateId)) === 1, {
    message: "Informe o arquivo (content) ou um template salvo (templateId).",
    path: ["content"],
  });

export const applyCalendarSchema = z.object({
  calendarId: z.string().uuid(),
});

// Templates de cronograma reutilizáveis (menu Templates).
export const createScheduleTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  filename: z.string().trim().max(200).optional(),
  content: fileContent,
});
