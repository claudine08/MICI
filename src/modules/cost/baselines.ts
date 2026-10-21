import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { assertCostProject, listCostItems } from "@/modules/cost/selectors";

// Baseline de custo (E08 §29): snapshot imutável do orçamento aprovado —
// reutiliza o model `Baseline` com type=COST. O `value` do snapshot guarda o
// orçamento total no momento da captura (BAC medido). APROVED é imutável
// (BASELINE_IMMUTABLE) e uma nova aprovação supersede a anterior (mesma
// lógica da baseline de cronograma).

interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface CostBaselineRow {
  id: string;
  projectId: string;
  version: number;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "SUPERSEDED";
  reason: string | null;
  totalBudget: number;
  itemCount: number;
  changeRequestId: string | null;
  changeCode: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

async function loadBaseline(organizationId: string, baselineId: string) {
  const baseline = await prisma.baseline.findFirst({
    where: { id: baselineId, organizationId, type: "COST" },
  });
  if (!baseline) {
    throw new AppError("NOT_FOUND", "Baseline de custo não encontrada nesta organização.");
  }
  return baseline;
}

// resolveChangeCodes: mapeia changeRequestId → código (CR001) para expor o
// vínculo baseline↔mudança (BR-005) na listagem.
async function resolveChangeCodes(
  rows: { changeRequestId: string | null }[]
): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.changeRequestId).filter((v): v is string => !!v))];
  if (ids.length === 0) return new Map();
  const changes = await prisma.changeRequest.findMany({
    where: { id: { in: ids } },
    select: { id: true, code: true },
  });
  return new Map(changes.map((c) => [c.id, c.code]));
}

function toRow(
  record: {
    id: string;
    projectId: string;
    version: number;
    status: "DRAFT" | "SUBMITTED" | "APPROVED" | "SUPERSEDED";
    reason: string | null;
    snapshot: unknown;
    changeRequestId: string | null;
    approvedAt: Date | null;
    approvedBy: string | null;
    createdAt: Date;
  },
  changeCodes: Map<string, string>
): CostBaselineRow {
  const snap = (record.snapshot ?? {}) as { totalBudget?: number; itemCount?: number };
  return {
    id: record.id,
    projectId: record.projectId,
    version: record.version,
    status: record.status,
    reason: record.reason,
    totalBudget: snap.totalBudget ?? 0,
    itemCount: snap.itemCount ?? 0,
    changeRequestId: record.changeRequestId,
    changeCode:
      record.changeRequestId ? (changeCodes.get(record.changeRequestId) ?? null) : null,
    approvedAt: iso(record.approvedAt),
    approvedBy: record.approvedBy,
    createdAt: record.createdAt.toISOString(),
  };
}

export async function listCostBaselines(
  organizationId: string,
  projectId: string
): Promise<CostBaselineRow[]> {
  await assertCostProject(organizationId, projectId);
  const rows = await prisma.baseline.findMany({
    where: { organizationId, projectId, type: "COST" },
    orderBy: { version: "desc" },
  });
  const changeCodes = await resolveChangeCodes(rows);
  return rows.map((row) => toRow(row, changeCodes));
}

export async function createCostBaseline(
  input: ActorContext & { projectId: string; reason?: string }
) {
  await assertCostProject(input.organizationId, input.projectId);

  const items = await listCostItems(input.organizationId, input.projectId);
  const totalBudget = round2(items.reduce((acc, item) => acc + item.amount, 0));

  const last = await prisma.baseline.findFirst({
    where: { organizationId: input.organizationId, projectId: input.projectId, type: "COST" },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const baseline = await prisma.baseline.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      type: "COST",
      version: (last?.version ?? 0) + 1,
      status: "DRAFT",
      snapshot: {
        capturedAt: new Date().toISOString(),
        totalBudget,
        itemCount: items.length,
        items,
      } as never,
      reason: input.reason?.trim() || null,
      createdBy: input.actorId,
    },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      projectId: input.projectId,
      objectType: "Baseline",
      objectId: baseline.id,
      action: "CREATE",
      newValue: { type: "COST", version: baseline.version, totalBudget },
      reason: baseline.reason,
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });

  return toRow(baseline, await resolveChangeCodes([baseline]));
}

const TRANSITIONS: Record<string, { from: string[]; to: string }> = {
  SUBMIT: { from: ["DRAFT"], to: "SUBMITTED" },
  APPROVE: { from: ["DRAFT", "SUBMITTED"], to: "APPROVED" },
  REJECT: { from: ["SUBMITTED"], to: "DRAFT" },
};

export async function transitionCostBaseline(
  input: ActorContext & { baselineId: string; action: "SUBMIT" | "APPROVE" | "REJECT" }
) {
  const baseline = await loadBaseline(input.organizationId, input.baselineId);
  const rule = TRANSITIONS[input.action];

  if (baseline.status === "APPROVED" || baseline.status === "SUPERSEDED") {
    throw new AppError(
      "BASELINE_IMMUTABLE",
      "Baseline de custo aprovada é imutável; alteração exige ChangeRequest aprovado."
    );
  }
  if (!rule.from.includes(baseline.status)) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Transição inválida: ${baseline.status} não aceita ${input.action}.`,
      { details: { allowedFrom: rule.from } }
    );
  }

  const data: Record<string, unknown> = { status: rule.to };
  if (input.action === "APPROVE") {
    data.approvedAt = new Date();
    data.approvedBy = input.actorId;
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (input.action === "APPROVE") {
      await tx.baseline.updateMany({
        where: {
          organizationId: input.organizationId,
          projectId: baseline.projectId,
          type: "COST",
          status: "APPROVED",
          id: { not: baseline.id },
        },
        data: { status: "SUPERSEDED" },
      });
    }
    return tx.baseline.update({ where: { id: baseline.id }, data });
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      projectId: baseline.projectId,
      objectType: "Baseline",
      objectId: baseline.id,
      action: input.action,
      oldValue: { status: baseline.status },
      newValue: { status: updated.status },
      reason: baseline.reason,
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });

  return toRow(updated, await resolveChangeCodes([updated]));
}

export async function deleteCostBaseline(input: ActorContext & { baselineId: string }) {
  const baseline = await loadBaseline(input.organizationId, input.baselineId);

  if (baseline.status === "APPROVED" || baseline.status === "SUPERSEDED") {
    throw new AppError(
      "BASELINE_IMMUTABLE",
      "Baseline de custo aprovada é imutável; alteração exige ChangeRequest aprovado."
    );
  }

  await prisma.baseline.delete({ where: { id: baseline.id } });
  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      projectId: baseline.projectId,
      objectType: "Baseline",
      objectId: baseline.id,
      action: "DELETE",
      oldValue: { type: "COST", version: baseline.version, status: baseline.status },
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });

  return { baselineId: baseline.id };
}
