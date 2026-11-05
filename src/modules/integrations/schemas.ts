import { z } from "zod";

export const createWebhookEndpointSchema = z.object({
  url: z.string().url().max(2048),
  secret: z.string().min(8).max(256).optional(),
  events: z.array(z.string().min(1).max(120)).default([]),
  isActive: z.boolean().optional(),
  description: z.string().max(200).optional(),
});

export const updateWebhookEndpointSchema = z.object({
  url: z.string().url().max(2048).optional(),
  secret: z.string().min(8).max(256).optional(),
  events: z.array(z.string().min(1).max(120)).optional(),
  isActive: z.boolean().optional(),
  description: z.string().max(200).optional().nullable(),
});