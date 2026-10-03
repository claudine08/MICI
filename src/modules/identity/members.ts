import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { hashPassword } from "@/lib/password";

// Comandos de membresia (E02): convite, atualização e remoção.
// Regras de segurança: não alterar a própria membresia; nunca remover o
// último ADMINISTRADOR ativo da organização.

interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

function generateTemporaryPassword(): string {
  return `Mici${randomBytes(4).toString("hex")}`;
}

async function requireRoles(organizationId: string, roleCodes: string[]) {
  if (roleCodes.length === 0) {
    throw new AppError("VALIDATION_ERROR", "Informe ao menos um papel.");
  }
  const roles = await prisma.role.findMany({
    where: { organizationId, code: { in: roleCodes }, deletedAt: null },
  });
  const found = new Set(roles.map((r) => r.code));
  const missing = roleCodes.filter((code) => !found.has(code));
  if (missing.length > 0) {
    throw new AppError("VALIDATION_ERROR", `Papéis inválidos: ${missing.join(", ")}`);
  }
  return roles;
}

async function countOtherActiveAdmins(organizationId: string, excludeMembershipId: string) {
  return prisma.organizationMembership.count({
    where: {
      organizationId,
      deletedAt: null,
      status: "ACTIVE",
      id: { not: excludeMembershipId },
      roles: { some: { role: { code: "ADMIN", deletedAt: null } } },
    },
  });
}

export interface InviteMemberInput extends ActorContext {
  email: string;
  name?: string;
  temporaryPassword?: string;
  roleCodes: string[];
}

export async function inviteMember(input: InviteMemberInput) {
  const email = input.email.trim().toLowerCase();
  const roles = await requireRoles(input.organizationId, input.roleCodes);

  let generatedPassword: string | undefined;
  const existingUser = await prisma.user.findUnique({ where: { email } });

  let userId: string;
  if (existingUser) {
    if (existingUser.deletedAt) {
      throw new AppError("CONFLICT", "Usuário desativado. Reative o usuário antes de convidar.");
    }
    const existingMembership = await prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: input.organizationId, userId: existingUser.id } },
    });
    if (existingMembership && !existingMembership.deletedAt) {
      throw new AppError("CONFLICT", "Este e-mail já é membro da organização.");
    }
    userId = existingUser.id;
  } else {
    generatedPassword = input.temporaryPassword ?? generateTemporaryPassword();
    const created = await prisma.user.create({
      data: {
        email,
        name: input.name?.trim() || email.split("@")[0],
        passwordHash: await hashPassword(generatedPassword),
        status: "ACTIVE",
      },
    });
    userId = created.id;
  }

  const membership = await prisma.organizationMembership.create({
    data: {
      organizationId: input.organizationId,
      userId,
      status: "ACTIVE",
      invitedAt: new Date(),
      invitedBy: input.actorId,
      roles: { create: roles.map((role) => ({ roleId: role.id })) },
    },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      objectType: "Membership",
      objectId: membership.id,
      action: "INVITE",
      newValue: { email, roleCodes: input.roleCodes },
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });

  await prisma.domainEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      eventType: "Member.Invited",
      aggregateType: "Membership",
      aggregateId: membership.id,
      payload: { email, roleCodes: input.roleCodes },
    },
  });

  return {
    membershipId: membership.id,
    userId,
    email,
    generatedPassword,
  };
}

export interface UpdateMemberInput extends ActorContext {
  membershipId: string;
  roleCodes?: string[];
  status?: "ACTIVE" | "SUSPENDED";
}

export async function updateMember(input: UpdateMemberInput) {
  const membership = await prisma.organizationMembership.findFirst({
    where: { id: input.membershipId, organizationId: input.organizationId, deletedAt: null },
    include: { roles: { include: { role: true } } },
  });
  if (!membership) {
    throw new AppError("NOT_FOUND", "Membresia não encontrada nesta organização.");
  }
  if (membership.userId === input.actorId) {
    throw new AppError("FORBIDDEN", "Não é possível alterar a própria membresia.");
  }

  const currentRoleCodes = membership.roles.map((r) => r.role.code);
  const nextRoleCodes = input.roleCodes ?? currentRoleCodes;
  const nextStatus = input.status ?? membership.status;

  const losesAdmin =
    currentRoleCodes.includes("ADMIN") &&
    (!nextRoleCodes.includes("ADMIN") || nextStatus !== "ACTIVE");
  if (losesAdmin) {
    const otherAdmins = await countOtherActiveAdmins(input.organizationId, membership.id);
    if (otherAdmins === 0) {
      throw new AppError(
        "FORBIDDEN",
        "Operação bloqueada: este é o último administrador ativo da organização."
      );
    }
  }

  if (input.roleCodes) {
    const roles = await requireRoles(input.organizationId, input.roleCodes);
    await prisma.membershipRole.deleteMany({ where: { membershipId: membership.id } });
    await prisma.membershipRole.createMany({
      data: roles.map((role) => ({ membershipId: membership.id, roleId: role.id })),
    });
  }

  if (input.status) {
    await prisma.organizationMembership.update({
      where: { id: membership.id },
      data: { status: input.status },
    });
  }

  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      objectType: "Membership",
      objectId: membership.id,
      action: "UPDATE",
      oldValue: { roleCodes: currentRoleCodes, status: membership.status },
      newValue: { roleCodes: nextRoleCodes, status: nextStatus },
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });

  await prisma.domainEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      eventType: "Member.Updated",
      aggregateType: "Membership",
      aggregateId: membership.id,
      payload: { roleCodes: nextRoleCodes, status: nextStatus },
    },
  });

  return { membershipId: membership.id, roleCodes: nextRoleCodes, status: nextStatus };
}

export async function removeMember(input: ActorContext & { membershipId: string }) {
  const membership = await prisma.organizationMembership.findFirst({
    where: { id: input.membershipId, organizationId: input.organizationId, deletedAt: null },
    include: { roles: { include: { role: true } } },
  });
  if (!membership) {
    throw new AppError("NOT_FOUND", "Membresia não encontrada nesta organização.");
  }
  if (membership.userId === input.actorId) {
    throw new AppError("FORBIDDEN", "Não é possível remover a própria membresia.");
  }

  const currentRoleCodes = membership.roles.map((r) => r.role.code);
  if (currentRoleCodes.includes("ADMIN") && membership.status === "ACTIVE") {
    const otherAdmins = await countOtherActiveAdmins(input.organizationId, membership.id);
    if (otherAdmins === 0) {
      throw new AppError(
        "FORBIDDEN",
        "Operação bloqueada: este é o último administrador ativo da organização."
      );
    }
  }

  await prisma.organizationMembership.update({
    where: { id: membership.id },
    data: { status: "SUSPENDED", deletedAt: new Date(), deletedBy: input.actorId },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      objectType: "Membership",
      objectId: membership.id,
      action: "DELETE",
      oldValue: { roleCodes: currentRoleCodes, status: membership.status },
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });

  await prisma.domainEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      eventType: "Member.Removed",
      aggregateType: "Membership",
      aggregateId: membership.id,
      payload: {},
    },
  });

  return { membershipId: membership.id };
}
