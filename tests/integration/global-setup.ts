import { spawnSync } from "node:child_process";
import { config } from "dotenv";

// Setup global dos testes de integração:
// 1. carrega .env.test local (o CI exporta DATABASE_URL diretamente);
// 2. reseta o schema do banco de teste (`prisma db push --force-reset`).
//    Com MICI_TEST_NO_RESET=1 o reset é pulado (apenas sincroniza o schema,
//    preservando os dados existentes — os testes usam sufixos únicos).

export default function globalSetup(): void {
  config({ path: ".env.test" });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL ausente para testes de integração. " +
        "Crie .env.test (veja .env.example) ou exporte DATABASE_URL no CI."
    );
  }
  if (/\/mici(\?|$)/.test(databaseUrl) && !/mici_test/.test(databaseUrl)) {
    throw new Error(
      "DATABASE_URL aponta para o banco principal. Use o banco de teste (mici_test)."
    );
  }

  const args = ["prisma", "db", "push"];
  if (!process.env.MICI_TEST_NO_RESET) {
    args.push("--force-reset");
  }

  const result = spawnSync("npx", args, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`prisma db push falhou (exit ${result.status}).`);
  }
}
