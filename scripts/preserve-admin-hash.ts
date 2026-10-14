import { prisma } from "@/lib/prisma";
import { readFileSync, writeFileSync } from "node:fs";

// Uso: npx dotenv -e .env.vercel.tmp -- tsx scripts/preserve-admin-hash.ts <save|restore>
// save: grava o hash atual do admin em .admin-hash.tmp
// restore: regrava o hash salvo no admin (após sincronização de dados)

const mode = process.argv[2];
const file = ".admin-hash.tmp";

async function main() {
  const admin = await prisma.user.findUnique({
    where: { email: "admin@mici.demo" },
    select: { id: true, passwordHash: true },
  });
  if (!admin?.passwordHash) throw new Error("admin@mici.demo sem hash");

  if (mode === "save") {
    writeFileSync(file, admin.passwordHash, "utf8");
    console.log(`hash salvo (${admin.passwordHash.slice(0, 12)}...)`);
  } else if (mode === "restore") {
    const hash = readFileSync(file, "utf8");
    await prisma.user.update({
      where: { email: "admin@mici.demo" },
      data: { passwordHash: hash },
    });
    console.log("hash do admin restaurado");
  } else {
    throw new Error("modo inválido: use save ou restore");
  }
}

void main().finally(() => prisma.$disconnect());
