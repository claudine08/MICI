import { prisma } from "../src/lib/prisma";
import { allPermissionCodes, ROLE_CODES, expandRolePermissions } from "../src/core/rbac";

async function main() {
  // Ensure permission catalog (adds PMO:VIEW etc.)
  const existing = await prisma.permission.findMany({ select: { id: true, code: true } });
  const byCode = new Map(existing.map((p) => [p.code, p.id]));
  for (const code of allPermissionCodes()) {
    if (!byCode.has(code)) {
      const [module, action] = code.split(":");
      const created = await prisma.permission.create({
        data: { code, module, action },
        select: { id: true, code: true },
      });
      byCode.set(created.code, created.id);
    }
  }
  console.log("permission catalog ok");

  const orgs = await prisma.organization.findMany({ where: { deletedAt: null }, select: { id: true } });
  for (const org of orgs) {
    const permissionRows = await prisma.permission.findMany({ select: { id: true, code: true } });
    const permissionIds = new Map(permissionRows.map((p) => [p.code, p.id]));
    for (const roleCode of ROLE_CODES) {
      let role = await prisma.role.findFirst({ where: { organizationId: org.id, code: roleCode, deletedAt: null }, select: { id: true } });
      if (!role) {
        role = await prisma.role.create({ data: { organizationId: org.id, code: roleCode, name: roleCode, isSystem: true }, select: { id: true } });
      }
      const grants = expandRolePermissions(roleCode)
        .map((code) => ({ roleId: role!.id, permissionId: permissionIds.get(code) }))
        .filter((g): g is { roleId: string; permissionId: string } => !!g.permissionId);
      if (grants.length) await prisma.rolePermission.createMany({ data: grants, skipDuplicates: true });
    }
    console.log(`org ${org.id} roles ensured`);
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });