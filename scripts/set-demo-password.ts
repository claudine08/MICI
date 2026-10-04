import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

// Uso: tsx scripts/set-demo-password.ts "<senha-forte>"
// Troca a senha de TODOS os usuários *@mici.demo (ambient demo/seed).

const password = process.argv[2];
if (!password || password.length < 8) {
  console.error("uso: tsx scripts/set-demo-password.ts <senha com 8+ caracteres>");
  process.exit(1);
}

async function main() {
  const hash = await hashPassword(password);
  const result = await prisma.user.updateMany({
    where: { email: { endsWith: "@mici.demo" } },
    data: { passwordHash: hash },
  });
  console.log(`senhas atualizadas: ${result.count}`);
  await prisma.$disconnect();
}

void main();
