import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

// Uso: npx dotenv -e .env.vercel.tmp -- tsx scripts/reset-profile-passwords.ts
// Redefine a senha dos perfis demo (gerente, pmo, viewer, qualidade) para Demo@1234.
// NÃO toca em admin@mici.demo.

const TARGETS = [
  "gerente@mici.demo",
  "pmo@mici.demo",
  "viewer@mici.demo",
  "qualidade@mici.demo",
];
const PASSWORD = "Demo@1234";

async function main() {
  const hash = await hashPassword(PASSWORD);
  const result = await prisma.user.updateMany({
    where: { email: { in: TARGETS } },
    data: { passwordHash: hash },
  });
  console.log(`senhas redefinidas: ${result.count}`);
  for (const email of TARGETS) {
    const u = await prisma.user.findUnique({
      where: { email },
      select: { email: true, status: true, deletedAt: true, passwordHash: true },
    });
    console.log(
      `- ${email}: ${u ? `status=${u.status} deletedAt=${u.deletedAt ?? "-"} hash=${u.passwordHash?.slice(0, 16)}...` : "AUSENTE"}`
    );
  }
}

void main().finally(() => prisma.$disconnect());
