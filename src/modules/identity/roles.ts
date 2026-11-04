import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";

// Papéis customizados por organização (E02-US03/US04).
// Papéis do sistema (isSystem) são imutáveis via UI; grants fixados na matriz RBAC.

export interface CreateCustomRoleInput {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  code: string;
  name: string;
  description?: string;
  permissionCodes: string[];
  correlationId?: string;
  ipAddress?: string;
}

export interface UpdateRolePermissionsInput {
  organizationId: string;
  roleId: string;
  actorId: string;
  actorLabel: string;
  permissionCodes: string[];
  correlationId?: string;
  ipAddress?: string;
}

export async function updateRolePermissions(input: UpdateRolePermissionsInput) {
  if (input.permissionCodes.length === 0) {
    throw new AppError("VALIDATION_ERROR", "Selecione ao menos uma permissão.");
  }

  const role = await prisma.role.findFirst({
    where: { id: input.roleId, organizationId: input.organizationId, deletedAt: null },
    select: { id: true, code: true, name: true, isSystem: true },
  });
  if (!role) {
    throw new AppError("NOT_FOUND", "Papel não encontrado.");
  }

  const permissions = await prisma.permission.findMany({
    where: { code: { in: input.permissionCodes } },
  });
  const found = new Set(permissions.map((p) => p.code));
  const missing = input.permissionCodes.filter((code_) => !found.has(code_));
  if (missing.length > 0) {
    throw new AppError("VALIDATION_ERROR", `Permissões desconhecidas: ${missing.join(", ")}`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
    await tx.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: role.id,
        permissionId: permission.id,
      })),
    });
    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        objectType: "Role",
        objectId: role.id,
        action: "UPDATE",
        newValue: { code: role.code, permissionCodes: input.permissionCodes },
        correlationId: input.correlationId ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
    await tx.domainEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        eventType: "Role.PermissionsUpdated",
        aggregateType: "Role",
        aggregateId: role.id,
        payload: { code: role.code, permissionCount: permissions.length },
      },
    });
  });

  return { id: role.id, code: role.code, name: role.name };
}
export async function createCustomRole(input: CreateCustomRoleInput) {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(code)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Código do papel deve ter 2–64 caracteres: A–Z, 0–9 e underscore."
    );
  }
  if (input.permissionCodes.length === 0) {
    throw new AppError("VALIDATION_ERROR", "Selecione ao menos uma permissão.");
  }

  const existing = await prisma.role.findFirst({
    where: { organizationId: input.organizationId, code, deletedAt: null },
  });
  if (existing) {
    throw new AppError("CONFLICT", `Já existe um papel com o código "${code}".`);
  }

  const permissions = await prisma.permission.findMany({
    where: { code: { in: input.permissionCodes } },
  });
  const found = new Set(permissions.map((p) => p.code));
  const missing = input.permissionCodes.filter((code_) => !found.has(code_));
  if (missing.length > 0) {
    throw new AppError("VALIDATION_ERROR", `Permissões desconhecidas: ${missing.join(", ")}`);
  }

  const role = await prisma.$transaction(async (tx) => {
    const created = await tx.role.create({
      data: {
        organizationId: input.organizationId,
        code,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        isSystem: false,
      },
    });
    await tx.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: created.id,
        permissionId: permission.id,
      })),
    });
    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        objectType: "Role",
        objectId: created.id,
        action: "CREATE",
        newValue: { code, name: created.name, permissionCodes: input.permissionCodes },
        correlationId: input.correlationId ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
    await tx.domainEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        eventType: "Role.Created",
        aggregateType: "Role",
        aggregateId: created.id,
        payload: { code, permissionCount: permissions.length },
      },
    });
    return created;
  });

  return { id: role.id, code: role.code, name: role.name };
}
