import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { can, toPermissionSet, type Module, type Action } from "@/core/rbac";

// Contexto de tenant (§10.4): o organization_id vem SEMPRE do cookie de contexto
// validado contra memberships do usuário autenticado — nunca do body da requisição.

export const ACTIVE_ORG_COOKIE = "mici_active_org";

export interface TenantContext {
  userId: string;
  userEmail: string;
  userName: string;
  membershipId: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  roleCodes: string[];
  permissions: ReadonlySet<string>;
}

interface MembershipRecord {
  id: string;
  status: string;
  deletedAt: Date | null;
  organization: {
    id: string;
    name: string;
    slug: string;
    status: string;
    deletedAt: Date | null;
  };
  roles: {
    role: {
      code: string;
      deletedAt: Date | null;
      permissions: {
        permission: { code: string };
      }[];
    };
  }[];
}

function toContext(
  userId: string,
  userEmail: string,
  userName: string,
  membership: MembershipRecord
): TenantContext {
  const permissions = new Set<string>();
  const roleCodes: string[] = [];
  for (const membershipRole of membership.roles) {
    if (membershipRole.role.deletedAt) continue;
    roleCodes.push(membershipRole.role.code);
    for (const rp of membershipRole.role.permissions) {
      permissions.add(rp.permission.code);
    }
  }
  return {
    userId,
    userEmail,
    userName,
    membershipId: membership.id,
    organizationId: membership.organization.id,
    organizationName: membership.organization.name,
    organizationSlug: membership.organization.slug,
    roleCodes: [...new Set(roleCodes)],
    permissions,
  };
}

const membershipInclude = {
  organization: true,
  roles: {
    include: {
      role: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
    },
  },
} as const;

async function loadMembership(
  userId: string,
  organizationId: string
): Promise<MembershipRecord | null> {
  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: membershipInclude,
  });
  if (!membership || membership.deletedAt) return null;
  if (membership.status !== "ACTIVE") return null;
  if (membership.organization.deletedAt) return null;
  if (membership.organization.status !== "ACTIVE") return null;
  return membership as unknown as MembershipRecord;
}

// Contexto do tenant ativo; null = sem sessão, sem org selecionada ou
// múltiplas orgs sem seleção. Cacheado por requisição (React cache).
export const getTenantContext = cache(async (): Promise<TenantContext | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const cookieStore = await cookies();
  const activeOrg = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;

  if (activeOrg) {
    const membership = await loadMembership(userId, activeOrg);
    if (!membership) return null;
    return toContext(userId, session.user.email ?? "", session.user.name ?? "", membership);
  }

  // Fallback: exatamente 1 organização ativa ⇒ contexto implícito (sem cookie).
  const memberships = await prisma.organizationMembership.findMany({
    where: { userId, status: "ACTIVE", deletedAt: null },
    include: membershipInclude,
    orderBy: { createdAt: "asc" },
    take: 2,
  });
  const active = memberships.filter(
    (m) => !m.deletedAt && m.organization.status === "ACTIVE" && !m.organization.deletedAt
  );
  if (active.length !== 1) return null;
  const membership = active[0] as unknown as MembershipRecord;
  return toContext(userId, session.user.email ?? "", session.user.name ?? "", membership);
});

// Para route handlers: exige sessão + tenant; lança AppError (401/400).
export async function requireTenantContext(): Promise<TenantContext> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AppError("UNAUTHENTICATED", "Sessão expirada ou ausente.");
  }
  const context = await getTenantContext();
  if (!context) {
    throw new AppError(
      "ORGANIZATION_REQUIRED",
      "Nenhuma organização ativa selecionada para este usuário."
    );
  }
  return context;
}

export function assertPermission(
  context: TenantContext,
  module: Module,
  action: Action
): void {
  if (!can(toPermissionSet(context.permissions), module, action)) {
    throw new AppError("FORBIDDEN", `Permissão negada: ${module}:${action}`);
  }
}
