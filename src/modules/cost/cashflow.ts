import { prisma } from "@/lib/prisma";
import { assertCostProject } from "@/modules/cost/selectors";
import { createCostItem } from "@/modules/cost/items";
import { createCommitment } from "@/modules/cost/commitments";
import { createActual } from "@/modules/cost/actuals";

interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

export interface CashflowRow {
  date: string;
  type: "PLANNED" | "COMMITTED" | "ACTUAL";
  code: string;
  description: string;
  category: string;
  wbs: string;
  activity: string;
  amount: number;
  source: string;
}

export async function exportCashflowCsv(
  organizationId: string,
  projectId: string
): Promise<string> {
  await assertCostProject(organizationId, projectId);

  const [items, commitments, actuals] = await Promise.all([
    prisma.costItem.findMany({
      where: { organizationId, projectId, deletedAt: null },
      include: { wbsNode: { select: { code: true } } },
    }),
    prisma.costCommitment.findMany({
      where: { organizationId, projectId, deletedAt: null },
      include: {
        wbsNode: { select: { code: true } },
        activity: { select: { code: true } },
        purchaseOrder: { select: { code: true } },
      },
    }),
    prisma.costActual.findMany({
      where: { organizationId, projectId, deletedAt: null },
      include: {
        wbsNode: { select: { code: true } },
        activity: { select: { code: true } },
        goodsReceipt: { select: { code: true } },
      },
    }),
  ]);

  const rows: CashflowRow[] = [];

  for (const it of items) {
    rows.push({
      date: "",
      type: "PLANNED",
      code: it.code,
      description: it.description,
      category: it.category,
      wbs: it.wbsNode?.code ?? "",
      activity: "",
      amount: Number(it.amount),
      source: it.origin ?? "CostItem",
    });
  }
  for (const c of commitments) {
    rows.push({
      date: c.committedAt.toISOString().slice(0, 10),
      type: "COMMITTED",
      code: c.code,
      description: c.description,
      category: "COMPROMISSO",
      wbs: c.wbsNode?.code ?? "",
      activity: c.activity?.code ?? "",
      amount: Number(c.amount),
      source: c.purchaseOrder?.code ?? "CostCommitment",
    });
  }
  for (const a of actuals) {
    rows.push({
      date: a.incurredAt.toISOString().slice(0, 10),
      type: "ACTUAL",
      code: a.code,
      description: a.description,
      category: "REALIZADO",
      wbs: a.wbsNode?.code ?? "",
      activity: a.activity?.code ?? "",
      amount: Number(a.amount),
      source: a.goodsReceipt?.code ?? "CostActual",
    });
  }

  const header = "date,type,code,description,category,wbs,activity,amount,source";
  const lines = [header];
  for (const r of rows) {
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    lines.push(
      [r.date, r.type, r.code, esc(r.description), r.category, r.wbs, r.activity, r.amount, r.source].join(",")
    );
  }
  return lines.join("\n");
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    // simple CSV split (no quoted commas support beyond basic)
    const cols = lines[i].split(",");
    const row: Record<string, string> = {};
    header.forEach((h, idx) => {
      row[h] = (cols[idx] ?? "").trim().replace(/^"|"$/g, "");
    });
    rows.push(row);
  }
  return rows;
}

export async function importCashflowCsv(
  organizationId: string,
  projectId: string,
  actor: ActorContext,
  csvText: string
): Promise<{ created: number }> {
  await assertCostProject(organizationId, projectId);
  const rows = parseCsv(csvText);
  let created = 0;
  for (const row of rows) {
    const type = (row.type || "PLANNED").toUpperCase();
    const description = row.description || "Importado";
    const amount = Number(row.amount || 0);
    if (!amount && type !== "PLANNED") continue;

    if (type === "PLANNED") {
      const category = row.category || "INDIRETO";
      await createCostItem({
        organizationId,
        actorId: actor.actorId,
        actorLabel: actor.actorLabel,
        projectId,
        description,
        category,
        unit: "un",
        quantity: 1,
        unitPrice: amount,
        wbsNodeId: null,
        activityId: null,
        origin: "CASHFLOW_IMPORT",
      });
      created++;
    } else if (type === "COMMITTED") {
      await createCommitment({
        organizationId,
        actorId: actor.actorId,
        actorLabel: actor.actorLabel,
        projectId,
        description,
        amount,
        committedAt: row.date || new Date().toISOString().slice(0, 10),
        costItemId: null,
        wbsNodeId: null,
        activityId: null,
        purchaseOrderId: null,
      });
      created++;
    } else if (type === "ACTUAL") {
      await createActual({
        organizationId,
        actorId: actor.actorId,
        actorLabel: actor.actorLabel,
        projectId,
        description,
        amount,
        incurredAt: row.date || new Date().toISOString().slice(0, 10),
        costItemId: null,
        commitmentId: null,
        wbsNodeId: null,
        activityId: null,
        goodsReceiptId: null,
      });
      created++;
    }
  }
  return { created };
}