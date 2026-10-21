import { prisma } from "@/lib/prisma";

// Verifica a consistência do ciclo de mudança (E11 §31) para os deltas de
// custo: vivo (CostItem) = baseline (snapshot.totalBudget) = BAC/EVM.
// Uso: tsx scripts/check-change-cost-consistency.ts [codigoMudanca]

const code = process.argv[2];

async function main() {
  const changes = await prisma.changeRequest.findMany({
  where: code ? { code } : { deletedAt: null, costDelta: { not: null } },
  select: {
    id: true,
    code: true,
    title: true,
    status: true,
    projectId: true,
    costDelta: true,
  },
  orderBy: { code: "asc" },
});

if (!changes.length) {
  console.log(code ? `${code}: nenhuma mudança com costDelta` : "Nenhuma mudança com costDelta");
  process.exit(0);
}

let problems = 0;

for (const change of changes) {
  const items = await prisma.costItem.findMany({
    where: { projectId: change.projectId, deletedAt: null },
    select: { amount: true, changeRequestId: true },
  });
  const adjustments = items.filter((i) => i.changeRequestId === change.id);
  const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
  const liveTotal = round2(items.reduce((acc, i) => acc + Number(i.amount), 0));
  const delta = round2(Number(change.costDelta ?? 0));

  const baselines = await prisma.baseline.findMany({
    where: { changeRequestId: change.id, type: "COST" },
    select: { version: true, status: true, snapshot: true },
    orderBy: { version: "asc" },
  });

  console.log(`\n${change.code} [${change.status}] delta=${delta} | ${change.title}`);
  console.log(`  vivo: ${items.length} itens, soma=${liveTotal}, ajustes da mudança=${adjustments.length}`);

  const checks: string[] = [];
  if (change.status !== "IMPLEMENTED" && change.status !== "VERIFIED" && change.status !== "CLOSED") {
    checks.push("ainda não implementada (sem baseline esperada)");
  } else if (adjustments.length === 0 && delta !== 0) {
    checks.push("ERRO: implementada com delta, mas sem item de ajuste no orçamento vivo");
    problems++;
  } else if (adjustments.length > 1) {
    checks.push(`ERRO: ${adjustments.length} itens de ajuste (idempotência violada)`);
    problems++;
  }

  for (const bl of baselines) {
    const snap = bl.snapshot as { totalBudget?: number; itemCount?: number; items?: unknown[] };
    const snapTotal = round2(Number(snap.totalBudget ?? 0));
    const snapItems = Array.isArray(snap.items) ? snap.items.length : 0;
    const line = `  baseline v${bl.version} [${bl.status}] totalBudget=${snapTotal} itensSnapshot=${snapItems}`;
    console.log(line);
    if (snapTotal !== liveTotal) {
      console.log(`    ERRO: snapshot (${snapTotal}) difere do vivo (${liveTotal})`);
      problems++;
    }
    if (snapItems !== items.length) {
      console.log(`    ERRO: snapshot tem ${snapItems} itens, vivo tem ${items.length}`);
      problems++;
    }
  }
}

console.log(`\n${problems === 0 ? "OK: consistente" : `${problems} problema(s) encontrado(s)`}`);
  process.exit(problems === 0 ? 0 : 1);
}

main();
