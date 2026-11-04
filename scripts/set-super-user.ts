import { prisma } from "@/lib/prisma";

// Uso:  npx dotenv -e .env.local -- tsx scripts/set-super-user.ts <email> [slug]
//       (sem slug ⇒ aplica em TODAS as memberships ativas do usuário)
//
// Atribui o papel do sistema SUPER_USER a um usuário existente. Idempotente.
// O papel precisa existir na organização (rode scripts/ensure-system-roles.ts
// uma vez por ambiente após atualizar ROLE_CODES). Não cria usuário novo e
// não revoga papéis.

const ROLE = "SUPER_USER";

async function main() {
  const [email, slug] = process.argv.slice(2);
  if (!email) {
    throw new Error("Uso: tsx scripts/set-super-user.ts <email> [slug]");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, status: true, deletedAt: true },
  });
  if (!user || user.deletedAt || user.status !== "ACTIVE") {
    throw new Error(`usuário "${email}" inexistente ou inativo.`);
  }

  const memberships = await prisma.organizationMembership.findMany({
    where: {
      userId: user.id,
      status: "ACTIVE",
      deletedAt: null,
      ...(slug ? { organization: { slug } } : {}),
    },
    select: { id: true, organization: { select: { id: true, slug: true, name: true } } },
  });
  if (memberships.length === 0) {
    throw new Error(
      `usuário "${email}" não tem membership ativa${slug ? ` em "${slug}"` : ""}.`,
    );
  }

  for (const membership of memberships) {
    const role = await prisma.role.findFirst({
      where: { organizationId: membership.organization.id, code: ROLE, deletedAt: null },
      select: { id: true },
    });
    if (!role) {
      throw new Error(
        `papel ${ROLE} inexistente em "${membership.organization.slug}". Rode scripts/ensure-system-roles.ts antes.`,
      );
    }
    const existing = await prisma.membershipRole.findUnique({
      where: { membershipId_roleId: { membershipId: membership.id, roleId: role.id } },
    });
    if (!existing) {
      await prisma.membershipRole.create({
        data: { membershipId: membership.id, roleId: role.id },
      });
      console.log(`ok: ${email} agora tem ${ROLE} em "${membership.organization.slug}"`);
    } else {
      console.log(`(já tinha) ${email} já tem ${ROLE} em "${membership.organization.slug}"`);
    }
  }
}

void main()
  .catch((error) => {
    console.error("falhou:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
