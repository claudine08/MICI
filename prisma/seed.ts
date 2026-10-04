import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import { allPermissionCodes } from "../src/core/rbac";
import { createOrganization } from "../src/modules/identity/services";
import { ensureDefaultGateDefinitions } from "../src/modules/gates/definitions";
import { createProject } from "../src/modules/portfolio/projects";

// Seed idempotente (§72): catálogo de permissões + organização demo + papéis +
// usuários de demonstração + gates G0–G8 + portfólio demo (Fase 2).
// Senhas demo: Demo@1234 (apenas ambiente local).

const DEMO_PASSWORD = "Demo@1234";

const DEMO_USERS = [
  { email: "admin@mici.demo", name: "Alice Admin", role: "ADMIN" as const },
  { email: "pmo@mici.demo", name: "Paulo PMO", role: "PMO" as const },
  { email: "gerente@mici.demo", name: "Gilda Gerente", role: "PROJECT_MANAGER" as const },
  { email: "qualidade@mici.demo", name: "Quinto Qualidade", role: "QUALITY" as const },
  { email: "viewer@mici.demo", name: "Vera Viewing", role: "VIEWER" as const },
];

async function ensurePermissionCatalog(): Promise<Map<string, string>> {
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
  return byCode;
}

async function main() {
  console.log("[seed] iniciando…");

  await ensurePermissionCatalog();
  console.log("[seed] catálogo de permissões ok");

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const users: Record<string, string> = {};
  for (const demo of DEMO_USERS) {
    const user = await prisma.user.upsert({
      where: { email: demo.email },
      update: { name: demo.name, status: "ACTIVE" },
      create: { email: demo.email, name: demo.name, passwordHash },
    });
    if (!user.passwordHash) {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });
    }
    users[demo.email] = user.id;
  }
  console.log(`[seed] ${DEMO_USERS.length} usuários demo ok`);

  const founderId = users["admin@mici.demo"];

  let organization = await prisma.organization.findUnique({ where: { slug: "demo" } });
  if (!organization) {
    const created = await createOrganization({
      name: "Cozinas MICI Demo",
      slug: "demo",
      actorId: founderId,
      actorEmail: "admin@mici.demo",
    });
    organization = await prisma.organization.findUnique({ where: { id: created.id } });
    console.log(`[seed] organização demo criada (${created.slug})`);
  } else {
    console.log("[seed] organização demo já existia");
  }
  const organizationId = organization!.id;

  const roles = await prisma.role.findMany({
    where: { organizationId },
    select: { id: true, code: true },
  });
  const roleIdByCode = new Map(roles.map((r) => [r.code, r.id]));

  for (const demo of DEMO_USERS) {
    const userId = users[demo.email];
    const membership = await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId, userId } },
      update: { status: "ACTIVE" },
      create: { organizationId, userId },
    });

    const roleId = roleIdByCode.get(demo.role)!;
    const existingRole = await prisma.membershipRole.findUnique({
      where: { membershipId_roleId: { membershipId: membership.id, roleId } },
    });
    if (!existingRole) {
      await prisma.membershipRole.create({
        data: { membershipId: membership.id, roleId },
      });
    }
  }
  console.log("[seed] memberships + papéis demo ok");

  // Gates oficiais G0–G8 (§17) — idempotente.
  await ensureDefaultGateDefinitions(prisma, organizationId, founderId);
  console.log("[seed] gate definitions G0–G8 ok");

  // Portfólio demo (E03): template padrão, cliente e projeto.
  let template = await prisma.projectTemplate.findFirst({
    where: { organizationId, code: "MICI-PADRAO", deletedAt: null },
  });
  if (!template) {
    template = await prisma.projectTemplate.create({
      data: {
        organizationId,
        code: "MICI-PADRAO",
        name: "MICI Padrão",
        description: "Template corporativo para projetos de cozinhas profissionais.",
        isDefault: true,
        createdBy: founderId,
        updatedBy: founderId,
      },
    });
    console.log("[seed] template MICI-PADRAO criado");
  }

  let client = await prisma.client.findFirst({
    where: { organizationId, code: "CLI-001", deletedAt: null },
  });
  if (!client) {
    client = await prisma.client.create({
      data: {
        organizationId,
        code: "CLI-001",
        name: "Restaurante Central Ltda",
        email: "contato@restaurantecentral.demo",
        createdBy: founderId,
        updatedBy: founderId,
      },
    });
    console.log("[seed] cliente CLI-001 criado");
  }

  const existingProject = await prisma.project.findFirst({
    where: { organizationId, code: "DEMO-001", deletedAt: null },
  });
  if (!existingProject) {
    await createProject({
      organizationId,
      actorId: founderId,
      actorLabel: "admin@mici.demo",
      code: "DEMO-001",
      name: "Cozinha Central — Reforma e Expansão",
      description: "Projeto demonstração do ciclo MICI (Fase 2).",
      clientId: client.id,
      projectTemplateId: template.id,
      projectType: "REMOVER_E_EXPANDIR",
      location: "São Paulo, SP",
      status: "ACTIVE",
      startDate: "2026-01-15",
      plannedEndDate: "2026-11-30",
    });
    console.log("[seed] projeto DEMO-001 criado (com snapshot de gates)");
  }

  console.log("[seed] concluído.");
  console.log("[seed] login: admin@mici.demo / Demo@1234");
}

main()
  .catch((error) => {
    console.error("[seed] falhou:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
