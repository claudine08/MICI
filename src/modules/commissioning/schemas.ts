import { z } from "zod";
import {
  COMMISSIONING_ITEM_ACTIONS,
  COMMISSIONING_PLAN_ACTIONS,
  ACCEPTANCE_ACTIONS,
} from "@/modules/commissioning/engine";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD).");
const commissioningCode = z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Código inválido.");
const longText = z.string().trim().max(4000);
const noteText = z.string().trim().max(1000);
const clientUuid = z.string().uuid().optional();

export const commissioningPlanActionSchema = z.enum(COMMISSIONING_PLAN_ACTIONS);
export const commissioningItemActionSchema = z.enum(COMMISSIONING_ITEM_ACTIONS);
export const acceptanceActionSchema = z.enum(ACCEPTANCE_ACTIONS);

export const createCommissioningPlanSchema = z.object({
  code: commissioningCode.optional(),
  title: z.string().trim().min(1).max(200),
  description: longText.optional(),
  ownerId: z.string().uuid().nullable().optional(),
  startDate: isoDate.optional(),
  plannedEndDate: isoDate.optional(),
  wbsNodeId: z.string().uuid().nullable().optional(),
  activityId: z.string().uuid().nullable().optional(),
  clientUuid,
});

export const updateCommissioningPlanSchema = createCommissioningPlanSchema.partial().omit({ code: true, clientUuid: true });

export const commissioningPlanTransitionSchema = z.object({
  action: commissioningPlanActionSchema,
  reason: noteText.optional(),
});

export const createCommissioningItemSchema = z.object({
  planId: z.string().uuid(),
  code: commissioningCode.optional(),
  title: z.string().trim().min(1).max(200),
  description: longText.optional(),
  systemName: z.string().trim().max(200).optional(),
  testMethod: longText.optional(),
  acceptanceCriteria: longText.optional(),
  wbsNodeId: z.string().uuid().nullable().optional(),
  activityId: z.string().uuid().nullable().optional(),
  inspectionId: z.string().uuid().nullable().optional(),
  clientUuid,
});

export const updateCommissioningItemSchema = createCommissioningItemSchema.partial().omit({ code: true, clientUuid: true });

export const commissioningItemTransitionSchema = z.object({
  action: commissioningItemActionSchema,
  reason: noteText.optional(),
  notes: longText.optional(),
  result: z.enum(["PASS", "FAIL", "NA"]).optional(),
  evidencePhotoId: z.string().uuid().nullable().optional(),
  evidenceNotes: longText.optional(),
});

export const createAcceptanceSchema = z.object({
  code: commissioningCode.optional(),
  commissioningPlanId: z.string().uuid().nullable().optional(),
  scope: z.string().trim().min(1).max(4000),
  notes: longText.optional(),
  wbsNodeId: z.string().uuid().nullable().optional(),
  activityId: z.string().uuid().nullable().optional(),
  documentId: z.string().uuid().nullable().optional(),
  clientUuid,
});

export const updateAcceptanceSchema = createAcceptanceSchema.partial().omit({ code: true, clientUuid: true });

export const acceptanceTransitionSchema = z.object({
  action: acceptanceActionSchema,
  reason: noteText.optional(),
  notes: longText.optional(),
});