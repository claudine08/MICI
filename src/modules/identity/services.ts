import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import {
  ROLE_CODES,
  expandRolePermissions,
  allPermissionCodes,
} from "@/core/rbac";
import { ensureDefaultGateDefinitions } from "@/modules/gates/definitions";

// Serviços de identidade/tenancy (§10, E02). Efeitos colaterais (auditoria +
// outbox) acontecem na MESMA transação do comando (BR-011, ADR-009).

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

interface CreateOrganizationInput {
  name: string;
  slug?: string;
  actorId: string;
  actorEmail: string;
  correlationId?: string;
  ipAddress?: string;
}

export async function createOrganization(input: CreateOrganizationInput) {
  const slug = input.slug ?? slugify(input.name);
  if (!slug) {
    throw new AppError("VALIDATION_ERROR", "Nome não gera um slug válido. Informe um slug.");
  }

  // O JWT continua válido mesmo após o usuário ser removido/desativado ou o
  // banco ser trocado/resetado. Sem esta checagem, o bootstrap inteiro roda e o
  // FK organization_memberships_user_id estoura como 500 depois de ~9s.
  const actor = await prisma.user.findUnique({
    where: { id: input.actorId },
    select: { id: true, status: true, deletedAt: true },
  });
  if (!actor) {
    // O id do token não existe neste banco: sessão emitida contra outro
    // banco/reset. Não é "sessão expirada" — o usuário só precisa logar de novo.
    throw new AppError(
      "SESSION_USER_NOT_FOUND",
      "Sua sessão não corresponde a este banco de dados. Saia e entre novamente."
    );
  }
  if (actor.deletedAt || actor.status !== "ACTIVE") {
    throw new AppError("FORBIDDEN", "Usuário desativado. Contate o administrador.");
  }

  const existing = await prisma.organization.findUnique({ where: { slug } });
  if (existing) {
    throw new AppError("CONFLICT", `Slug "${slug}" já está em uso.`);
  }

  try {
    // Bootstrap pesado (catálogo + 18 papéis + grants + gates): o default de 5s
    // estoura em bancos com latência de rede (Neon).
    return await prisma.$transaction(
      async (tx) => {
      const organization = await tx.organization.create({
        data: { name: input.name, slug },
      });

      // Catálogo global de permissões (idempotente — seed normalmente já criou).
      // skipDuplicates: criações concorrentes de organização disputam as mesas linhas.
      const permissionRows = await tx.permission.findMany({
        select: { id: true, code: true },
      });
      const permissionIds = new Map(permissionRows.map((p) => [p.code, p.id]));
      const missingCodes = allPermissionCodes().filter((code) => !permissionIds.has(code));
      if (missingCodes.length > 0) {
        await tx.permission.createMany({
          data: missingCodes.map((code) => ({
            code,
            module: code.split(":")[0],
            action: code.split(":")[1],
          })),
          skipDuplicates: true,
        });
        const refreshed = await tx.permission.findMany({ select: { id: true, code: true } });
        for (const row of refreshed) {
          permissionIds.set(row.code, row.id);
        }
      }

      // 18 papéis do sistema por organização, com grants da matriz RBAC.
      // Em lote: o create um-a-um (18 inserts + nested) dominava os ~50 round
      // trips de rede que deixavam este endpoint com ~14s no Neon.
      await tx.role.createMany({
        data: ROLE_CODES.map((roleCode) => ({
          organizationId: organization.id,
          code: roleCode,
          name: roleCode,
          isSystem: true,
        })),
        skipDuplicates: true,
      });
      const roleRows = await tx.role.findMany({
        where: { organizationId: organization.id },
        select: { id: true, code: true },
      });
      const roleIdByCode = new Map(roleRows.map((role) => [role.code, role.id]));

      await tx.rolePermission.createMany({
        data: ROLE_CODES.flatMap((roleCode) => {
          const roleId = roleIdByCode.get(roleCode);
          if (!roleId) {
            throw new Error(`Papel do sistema "${roleCode}" ausente após criação em lote.`);
          }
          return expandRolePermissions(roleCode).map((code) => {
            const permissionId = permissionIds.get(code);
            if (!permissionId) {
              throw new Error(`Permissão "${code}" ausente do catálogo.`);
            }
            return { roleId, permissionId };
          });
        }),
        skipDuplicates: true,
      });

      // Fundador vira ADMIN.
      const membership = await tx.organizationMembership.create({
        data: {
          organizationId: organization.id,
          userId: input.actorId,
          roles: {
            create: [{ roleId: roleIdByCode.get("ADMIN")! }],
          },
        },
      });

      // Gates oficiais G0–G8 (§17) como padrão da organização (E06-US01).
      await ensureDefaultGateDefinitions(tx, organization.id, input.actorId);

      await tx.auditEvent.create({
        data: {
          organizationId: organization.id,
          actorId: input.actorId,
          actorLabel: input.actorEmail,
          objectType: "Organization",
          objectId: organization.id,
          action: "CREATE",
          newValue: { name: organization.name, slug: organization.slug },
          correlationId: input.correlationId ?? null,
          ipAddress: input.ipAddress ?? null,
        },
      });

      await tx.domainEvent.create({
        data: {
          organizationId: organization.id,
          actorId: input.actorId,
          eventType: "Organization.Created",
          aggregateType: "Organization",
          aggregateId: organization.id,
          payload: { name: organization.name, slug: organization.slug },
        },
      });

      return {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        membershipId: membership.id,
      };
      },
      { timeout: 60_000, maxWait: 10_000 }
    );
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      throw new AppError("CONFLICT", `Slug "${slug}" já está em uso.`, { cause: error });
    }
    throw error;
  }
}

export interface UserOrganizationSummary {
  membershipId: string;
  organizationId: string;
  name: string;
  slug: string;
  roleCodes: string[];
}

export async function listUserOrganizations(userId: string): Promise<UserOrganizationSummary[]> {
  const memberships = await prisma.organizationMembership.findMany({
    where: { userId, status: "ACTIVE", deletedAt: null },
    include: {
      organization: true,
      roles: { include: { role: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return memberships
    .filter(
      (m) => m.organization.status === "ACTIVE" && !m.organization.deletedAt
    )
    .map((m) => ({
      membershipId: m.id,
      organizationId: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      roleCodes: m.roles.filter((r) => !r.role.deletedAt).map((r) => r.role.code),
    }));
}
