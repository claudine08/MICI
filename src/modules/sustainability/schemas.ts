import { z } from "zod";
import { SUSTAINABILITY_PLAN_ACTIONS } from "@/modules/sustainability/engine";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD).");
const susCode = z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Código inválido.");
const longText = z.string().trim().max(4000);
const noteText = z.string().trim().max(1000);
const clientUuid = z.string().uuid().optional();

export const sustainabilityPlanActionSchema = z.enum(SUSTAINABILITY_PLAN_ACTIONS);

export const createSustainabilityPlanSchema = z.object({
  code: susCode.optional(),
  title: z.string().trim().min(1).max(200),
  description: longText.optional(),
  ownerId: z.string().uuid().nullable().optional(),
  startDate: isoDate.optional(),
  plannedEndDate: isoDate.optional(),
  wbsNodeId: z.string().uuid().nullable().optional(),
  activityId: z.string().uuid().nullable().optional(),
  clientUuid,
});
export const updateSustainabilityPlanSchema = createSustainabilityPlanSchema.partial().omit({ code: true, clientUuid: true });
export const sustainabilityPlanTransitionSchema = z.object({
  action: sustainabilityPlanActionSchema,
  reason: noteText.optional(),
});

export const createSustainabilityMetricSchema = z.object({
  code: susCode.optional(),
  planId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(200),
  unit: z.string().trim().min(1).max(32),
  category: z.string().trim().max(64).optional(),
  description: longText.optional(),
  clientUuid,
});
export const updateSustainabilityMetricSchema = createSustainabilityMetricSchema.partial().omit({ code: true, clientUuid: true });

export const createSustainabilityBaselineSchema = z.object({
  code: susCode.optional(),
  metricId: z.string().uuid(),
  value: z.coerce.number(),
  recordedAt: isoDate,
  source: z.string().trim().max(200).optional(),
  notes: longText.optional(),
  clientUuid,
});
export const updateSustainabilityBaselineSchema = createSustainabilityBaselineSchema.partial().omit({ code: true, clientUuid: true, metricId: true });

export const createSustainabilityTargetSchema = z.object({
  code: susCode.optional(),
  metricId: z.string().uuid(),
  targetValue: z.coerce.number(),
  dueDate: isoDate.optional(),
  notes: longText.optional(),
  clientUuid,
});
export const updateSustainabilityTargetSchema = createSustainabilityTargetSchema.partial().omit({ code: true, clientUuid: true, metricId: true });

export const createSustainabilityMeasurementSchema = z.object({
  code: susCode.optional(),
  metricId: z.string().uuid(),
  value: z.coerce.number(),
  measuredAt: isoDate,
  wbsNodeId: z.string().uuid().nullable().optional(),
  activityId: z.string().uuid().nullable().optional(),
  notes: longText.optional(),
  evidenceNotes: longText.optional(),
  clientUuid,
});
export const updateSustainabilityMeasurementSchema = createSustainabilityMeasurementSchema.partial().omit({ code: true, clientUuid: true, metricId: true });

export const createWasteRecordSchema = z.object({
  code: susCode.optional(),
  wasteType: z.string().trim().min(1).max(120),
  quantity: z.coerce.number(),
  unit: z.string().trim().min(1).max(32),
  destination: z.string().trim().max(200).optional(),
  recordedAt: isoDate,
  wbsNodeId: z.string().uuid().nullable().optional(),
  activityId: z.string().uuid().nullable().optional(),
  notes: longText.optional(),
  clientUuid,
});
export const updateWasteRecordSchema = createWasteRecordSchema.partial().omit({ code: true, clientUuid: true });