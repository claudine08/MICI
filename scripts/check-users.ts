import { prisma } from "@/lib/prisma";

// Diagnóstico read-only: usuários e status no banco apontado por DATABASE_URL.
// Uso: npx dotenv -e .env.vercel.tmp -- tsx scripts/check-users.ts

async function main() {
  const users = await prisma.user.findMany({
    select: { email: true, status: true, deletedAt: true, lastLoginAt: true, passwordHash: true },
    orderBy: { email: "asc" },
  });
  console.log("users:", users.length);
  for (const u of users) {
    console.log(
      `- ${u.email} | status=${u.status} | deletedAt=${u.deletedAt ?? "-"} | lastLogin=${u.lastLoginAt ?? "-"} | hash=${u.passwordHash ? u.passwordHash.slice(0, 16) + "..." : "AUSENTE"}`
    );
  }
  console.log("organizations:", await prisma.organization.count());
  console.log(
    "memberships ACTIVE:",
    await prisma.organizationMembership.count({ where: { status: "ACTIVE" } })
  );
}

void main().finally(() => prisma.$disconnect());
