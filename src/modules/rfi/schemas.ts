import { z } from "zod";

export const createRfiSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200),
  subjectGroup: z.string().max(64).optional().nullable(),
  question: z.string().min(1),
  recipientId: z.string().uuid().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  wbsNodeId: z.string().uuid().optional().nullable(),
  activityId: z.string().uuid().optional().nullable(),
  requirementId: z.string().uuid().optional().nullable(),
});

export const updateRfiSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  subjectGroup: z.string().max(64).optional().nullable(),
  question: z.string().min(1).optional(),
  recipientId: z.string().uuid().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  wbsNodeId: z.string().uuid().optional().nullable(),
  activityId: z.string().uuid().optional().nullable(),
  requirementId: z.string().uuid().optional().nullable(),
});

export const answerRfiSchema = z.object({
  response: z.string().min(1),
});

export const transitionRfiSchema = z.object({
  action: z.enum(["ANSWER", "CLOSE", "CANCEL", "REOPEN"]),
});