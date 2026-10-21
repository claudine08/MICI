import { prisma } from "@/lib/prisma";
import { createCostItem } from "@/modules/cost/items";
import { listCostItems } from "@/modules/cost/selectors";

// Correção retroativa (one-off) do CR001 implementado ANTES da regra do item
// de ajuste (E11 §31): o costDelta foi embutido só na baseline (3.000.000),
// deixando o orçamento vivo em 2.958.929. Cria o CostItem de ajuste faltante
// e re-snapshota a baseline para vivo = baseline = BAC.
//
// Uso: dotenv -e .env.vercel.tmp -- npx tsx scripts/fix-cr001-cost-adjustment.ts
// Idempotente: roda de novo e não duplica nada.

const CR_CODE = "CR001";

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

async function main() {
  const changes = await prisma.changeRequest.findMany({
    where: { code: CR_CODE, costDelta: { not: null } },
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      projectId: true,
      organizationId: true,
      costDelta: true,
      category: true,
      implementedBy: true,
      requestedById: true,
    },
  });

  let fixes = 0;
  for (const change of changes) {
    const delta = round2(Number(change.costDelta ?? 0));
    if (delta === 0) continue;
    const implemented = ["IMPLEMENTED", "VERIFIED", "CLOSED"].includes(change.status);

    const existing = await prisma.costItem.findFirst({
      where: { projectId: change.projectId, changeRequestId: change.id },
      select: { id: true },
    });

    if (existing) {
      console.log(`${change.code} [${change.status}]: item de ajuste já existe (${existing.id})`);
    } else if (!implemented) {
      console.log(`${change.code} [${change.status}]: não implementada — sem ajuste a aplicar`);
      continue;
    } else {
      const actorId = change.implementedBy ?? change.requestedById;
      const actor = await prisma.user.findUnique({
        where: { id: actorId },
        select: { email: true },
      });
      const item = await createCostItem({
        organizationId: change.organizationId,
        actorId,
        actorLabel: actor?.email ?? "fix-retroativo",
        projectId: change.projectId,
        description: `Ajuste mudança ${change.code} — ${change.title}`.slice(0, 300),
        category: change.category,
        unit: "un",
        quantity: 1,
        unitPrice: delta,
        origin: "MUDANCA",
        fontePreco: `ChangeRequest ${change.code}`,
        changeRequestId: change.id,
      });
      console.log(`${change.code}: item de ajuste criado ${item.code} = ${delta}`);
      fixes++;
    }

    // Re-snapshota as baselines COST vinculadas com o vivo corrente.
    const items = await listCostItems(change.organizationId, change.projectId);
    const total = round2(items.reduce((acc, i) => acc + i.amount, 0));
    const baselines = await prisma.baseline.findMany({
      where: { changeRequestId: change.id, type: "COST" },
      select: { id: true, version: true, status: true, snapshot: true },
    });

    for (const bl of baselines) {
      const snap = bl.snapshot as { items?: unknown[]; totalBudget?: number };
      const snapCount = Array.isArray(snap.items) ? snap.items.length : 0;
      const snapTotal = round2(Number(snap.totalBudget ?? 0));
      if (snapCount === items.length && snapTotal === total) {
        console.log(`  baseline v${bl.version} [${bl.status}]: já consistente`);
        continue;
      }
      const newSnapshot = {
        ...snap,
        capturedAt: new Date().toISOString(),
        totalBudget: total,
        baseTotalBudget: round2(total - delta),
        itemCount: items.length,
        items,
        changeId: change.id,
        changeCode: change.code,
        costDelta: delta,
        retroFixedAt: new Date().toISOString(),
        retroFixReason: "backfill do item de ajuste de custo (E11 §31)",
      };
      await prisma.baseline.update({
        where: { id: bl.id },
        data: { snapshot: newSnapshot as never },
      });
      console.log(
        `  baseline v${bl.version} [${bl.status}]: re-snapshotada ` +
          `(${snapCount}→${items.length} itens, ${snapTotal}→${total})`
      );
      fixes++;
    }
  }

  console.log(`\n${fixes === 0 ? "nada a corrigir" : `${fixes} correção(ões) aplicada(s)`}`);
}

main();
