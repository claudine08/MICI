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

// Política de senha: 8+ caracteres, ao menos 1 letra e 1 dígito.
export const passwordSchema = z
  .string()
  .min(8, "Mínimo de 8 caracteres.")
  .regex(/[A-Za-z]/, "Deve conter ao menos uma letra.")
  .regex(/\d/, "Deve conter ao menos um dígito.");

export const inviteMemberSchema = z.object({
  email: z.string().email("E-mail inválido."),
  name: z.string().trim().min(1).max(200).optional(),
  temporaryPassword: passwordSchema.optional(),
  roleCodes: z.array(z.string().min(1)).min(1, "Selecione ao menos um papel."),
});

export const updateMemberSchema = z
  .object({
    roleCodes: z.array(z.string().min(1)).optional(),
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  })
  .refine((value) => value.roleCodes !== undefined || value.status !== undefined, {
    message: "Informe roleCodes e/ou status.",
  });

export const createRoleSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[A-Za-z][A-Za-z0-9_]*$/, "Use A–Z, 0–9 e underscore."),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  permissionCodes: z.array(z.string().min(1)).min(1, "Selecione ao menos uma permissão."),
});
