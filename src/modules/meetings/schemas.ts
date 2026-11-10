import { z } from "zod";

export const meetingStatusSchema = z.enum(["DRAFT", "SUBMITTED", "APPROVED", "CANCELLED"]);

export const createMeetingSchema = z.object({
  projectId: z.string().uuid().optional().nullable(),
  title: z.string().min(1).max(200),
  meetingDate: z.string().min(1),
  location: z.string().max(200).optional().nullable(),
  attendees: z.array(z.string()).optional(),
  minutes: z.string().optional().nullable(),
});

export const updateMeetingSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  meetingDate: z.string().optional(),
  location: z.string().max(200).optional().nullable(),
  attendees: z.array(z.string()).optional(),
  minutes: z.string().optional().nullable(),
});

export const createMeetingActionSchema = z.object({
  description: z.string().min(1),
  ownerId: z.string().uuid().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  wbsNodeId: z.string().uuid().optional().nullable(),
  activityId: z.string().uuid().optional().nullable(),
  requirementId: z.string().uuid().optional().nullable(),
});

export const transitionMeetingSchema = z.object({
  action: z.enum(["SUBMIT", "APPROVE", "CANCEL", "REOPEN"]),
});