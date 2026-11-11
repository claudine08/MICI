import { z } from "zod";

export const createSupplierRfiSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  wbsNodeId: z.string().uuid().optional().nullable(),
  activityId: z.string().uuid().optional().nullable(),
  supplierIds: z.array(z.string().uuid()).optional(),
});

export const updateSupplierRfiSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  wbsNodeId: z.string().uuid().optional().nullable(),
  activityId: z.string().uuid().optional().nullable(),
});

export const recordResponseSchema = z.object({
  supplierId: z.string().uuid(),
  quotedAmount: z.number().optional(),
  leadTimeDays: z.number().int().optional(),
  notes: z.string().optional().nullable(),
});

export const selectSupplierSchema = z.object({
  supplierId: z.string().uuid(),
});