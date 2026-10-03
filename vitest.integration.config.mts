import path from "node:path";
import { defineConfig } from "vitest/config";

// Testes de integração (isolamento de tenant, E02-US05) — exigem PostgreSQL.
// global-setup aplica `prisma db push --force-reset` no DATABASE_URL de teste.

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/integration/global-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
