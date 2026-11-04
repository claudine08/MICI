import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

// Uso:  npx dotenv -e .env.local -- tsx scripts/create-demo-super.ts [slug]
//       (slug default: "demo")
//
// Garante o usuário demo super@mici.demo (SUPER_USER) na organização informada.
// Idempotente: cria usuário/membership/papel apenas se ausentes; senha só é
// definida quando o usuário não tem hash.
// NÃO usar em orgs de clientes reais — IDs demo são ambientais (§72).

const EMAIL = "super@mici.demo";
const NAME = "Sofia Super Usuário";
const PASSWORD = "Demo@1234";
const ROLE = "SUPER_USER";

async function main() {
  const slug = process.argv[2] ?? "demo";
  const organization = await prisma.organization.findUnique({ where: { slug } });
  if (!organization) {
    throw new Error(`organização "${slug}" inexistente.`);
  }
  const role = await prisma.role.findFirst({
    where: { organizationId: organization.id, code: ROLE, deletedAt: null },
    select: { id: true },
  });
  if (!role) {
    throw new Error(
      `papel ${ROLE} inexistente em "${slug}". Rode scripts/ensure-system-roles.ts antes.`,
    );
  }

  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { name: NAME, status: "ACTIVE" },
    create: { email: EMAIL, name: NAME, passwordHash },
    select: { id: true, passwordHash: true },
  });
  if (!user.passwordHash) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
  }

  const membership = await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
    update: { status: "ACTIVE" },
    create: { organizationId: organization.id, userId: user.id },
  });

  const existing = await prisma.membershipRole.findUnique({
    where: { membershipId_roleId: { membershipId: membership.id, roleId: role.id } },
  });
  if (!existing) {
    await prisma.membershipRole.create({
      data: { membershipId: membership.id, roleId: role.id },
    });
  }

  console.log(`ok: ${EMAIL} (ACTIVE) tem papel ${ROLE} em "${slug}"`);
}

void main()
  .catch((error) => {
    console.error("falhou:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
