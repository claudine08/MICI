import { prisma } from "@/lib/prisma";

// Seletores de identidade (§106): leituras SEMPRE escopadas por organization_id.

export interface MemberRow {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  membershipStatus: string;
  userStatus: string;
  roleCodes: string[];
  lastLoginAt: Date | null;
  joinedAt: Date;
}

export async function listMembers(organizationId: string): Promise<MemberRow[]> {
  const memberships = await prisma.organizationMembership.findMany({
    where: { organizationId, deletedAt: null },
    include: {
      user: true,
      roles: { include: { role: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return memberships
    .filter((m) => !m.user.deletedAt)
    .map((m) => ({
      membershipId: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      membershipStatus: m.status,
      userStatus: m.user.status,
      roleCodes: m.roles.filter((r) => !r.role.deletedAt).map((r) => r.role.code),
      lastLoginAt: m.user.lastLoginAt,
      joinedAt: m.createdAt,
    }));
}

export interface RoleRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  memberCount: number;
  permissionCodes: string[];
}

export async function listRoles(organizationId: string): Promise<RoleRow[]> {
  const roles = await prisma.role.findMany({
    where: { organizationId, deletedAt: null },
    include: {
      permissions: { include: { permission: true } },
      memberships: true,
    },
    orderBy: [{ isSystem: "desc" }, { code: "asc" }],
  });

  return roles.map((role) => ({
    id: role.id,
    code: role.code,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    memberCount: role.memberships.length,
    permissionCodes: role.permissions.map((rp) => rp.permission.code),
  }));
}

export interface PermissionRow {
  code: string;
  module: string;
  action: string;
  description: string | null;
}

export async function listPermissionsCatalog(): Promise<PermissionRow[]> {
  const permissions = await prisma.permission.findMany({
    orderBy: [{ module: "asc" }, { action: "asc" }],
  });
  return permissions.map((p) => ({
    code: p.code,
    module: p.module,
    action: p.action,
    description: p.description,
  }));
}

// Membership ativa exata (org + usuário) — usado para validações de isolamento.
export async function findActiveMembership(organizationId: string, userId: string) {
  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  });
  if (!membership || membership.deletedAt || membership.status !== "ACTIVE") return null;
  return membership;
}
