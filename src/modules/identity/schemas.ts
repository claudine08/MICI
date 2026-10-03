import { z } from "zod";

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(200),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug deve conter apenas a-z, 0-9 e hífens.")
    .optional(),
});

export const activateOrganizationSchema = z.object({
  organizationId: z.string().uuid(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
