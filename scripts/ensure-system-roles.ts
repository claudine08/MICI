import { prisma } from "@/lib/prisma";
import { ROLE_CODES, allPermissionCodes, expandRolePermissions } from "@/core/rbac";

// Uso:  npx dotenv -e .env.local -- tsx scripts/ensure-system-roles.ts [slug1 slug2 …]
//       (sem argumentos ⇒ TODAS as organizações)
//
// Garante que cada organização possua todos os papéis do sistema (ROLE_CODES,
// matriz RBAC em src/core/rbac.ts) + grants de permissão, idempotente.
//
// Quando usar:
//  - Após adicionar um papel do sistema em ROLE_CODES (ex.: SUPER_USER em
//    03/11/2026): organizações novas nascem completas via createOrganization,
//    mas as EXISTENTES (Neon) precisam deste script antes do deploy.
//  - Após alterar ROLE_GRANTS de um papel existente: recria os grants faltantes
//    (idempotente — grants existentes não são duplicados).
//
// Não remove grants nem papéis (convergência aditiva — seguro para produção).

async function ensurePermissionCatalog(): Promise<Map<string, string>> {
  const byCode = new Map(
    (await prisma.permission.findMany({ select: { id: true, code: true } })).map((p) => [p.code, p.id]),
  );
  const missing = allPermissionCodes().filter((code) => !byCode.has(code));
  if (missing.length > 0) {
    await prisma.permission.createMany({
      data: missing.map((code) => ({ code, module: code.split(":")[0], action: code.split(":")[1] })),
      skipDuplicates: true,
    });
    const refreshed = await prisma.permission.findMany({ select: { id: true, code: true } });
    for (const row of refreshed) byCode.set(row.code, row.id);
  }
  return byCode;
}

async function ensureSystemRolesForOrganization(
  organizationId: string,
  slug: string,
): Promise<void> {
  const permissionIds = await ensurePermissionCatalog();
  const existingRoles = await prisma.role.findMany({
    where: { organizationId, deletedAt: null },
    select: { id: true, code: true },
  });
  const roleIdByCode = new Map(existingRoles.map((r) => [r.code, r.id]));
  const missingCodes = ROLE_CODES.filter((code) => !roleIdByCode.has(code));

  for (const code of missingCodes) {
    const role = await prisma.role.create({
      data: { organizationId, code, name: code, isSystem: true },
      select: { id: true },
    });
    roleIdByCode.set(code, role.id);
    console.log(`  + papel do sistema "${code}" criado`);
  }

  for (const roleCode of ROLE_CODES) {
    const roleId = roleIdByCode.get(roleCode);
    if (!roleId) throw new Error(`papel "${roleCode}" ausente (${slug})`);
    const grants = expandRolePermissions(roleCode)
      .map((code) => ({ roleId, permissionId: permissionIds.get(code) }))
      .filter((g): g is { roleId: string; permissionId: string } => g.permissionId !== undefined);
    const created = await prisma.rolePermission.createMany({ data: grants, skipDuplicates: true });
    if (created.count > 0) {
      console.log(`  + ${created.count} grants para "${roleCode}"`);
    }
  }

  if (missingCodes.length === 0) {
    const rolePermissionCount = await prisma.rolePermission.groupBy({
      by: ["roleId"],
      where: { roleId: { in: existingRoles.map((r) => r.id) } },
      _count: { _all: true },
    });
    console.log(
      `  = ok (${existingRoles.length} papéis, ${rolePermissionCount.reduce((n, g) => n + g._count._all, 0)} grants)`,
    );
  }
}

async function main() {
  const slugs = process.argv.slice(2);
  const organizations = await prisma.organization.findMany({
    where: slugs.length > 0 ? { slug: { in: slugs } } : { deletedAt: null },
    select: { id: true, slug: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (organizations.length === 0) {
    console.log(`nenhuma organização encontrada${slugs.length > 0 ? ` para: ${slugs.join(", ")}` : ""}`);
    return;
  }
  console.log(`organizações: ${organizations.map((o) => o.slug).join(", ")}`);
  for (const organization of organizations) {
    console.log(`[${organization.slug}] ${organization.name}`);
    await ensureSystemRolesForOrganization(organization.id, organization.slug);
  }
  console.log("concluído.");
}

void main()
  .catch((error) => {
    console.error("falhou:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
