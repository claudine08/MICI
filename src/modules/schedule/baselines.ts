import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { assertScheduleProject, listActivities, listDependencies } from "@/modules/schedule/selectors";

// Baselines (E07-US04, §28): snapshot imutável do cronograma. O snapshot é
// auto-contido (atividades + dependências copiadas no momento da captura) —
// mudanças posteriores no projeto não alteram a baseline. APROVED e SUPERSEDED
// são imutáveis (BASELINE_IMMUTABLE); alteração real exige ChangeRequest (E11).

interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

type BaselineTypeValue = "SCOPE" | "SCHEDULE" | "COST" | "SUSTAINABILITY";
type BaselineStatusValue = "DRAFT" | "SUBMITTED" | "APPROVED" | "SUPERSEDED";
type BaselineAction = "SUBMIT" | "APPROVE" | "REJECT";

export interface BaselineRow {
  id: string;
  projectId: string;
  type: BaselineTypeValue;
  version: number;
  status: BaselineStatusValue;
  reason: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
  createdBy: string | null;
  activityCount: number;
  dependencyCount: number;
  capturedAt: string | null;
}

interface BaselineRecord {
  id: string;
  projectId: string;
  type: BaselineTypeValue;
  version: number;
  status: BaselineStatusValue;
  reason: string | null;
  snapshot: unknown;
  approvedAt: Date | null;
  approvedBy: string | null;
  createdAt: Date;
  createdBy: string | null;
}

function snapshotCounts(snapshot: unknown): {
  activityCount: number;
  dependencyCount: number;
  capturedAt: string | null;
} {
  const data = (snapshot ?? {}) as {
    activities?: unknown[];
    dependencies?: unknown[];
    capturedAt?: string;
  };
  return {
    activityCount: Array.isArray(data.activities) ? data.activities.length : 0,
    dependencyCount: Array.isArray(data.dependencies) ? data.dependencies.length : 0,
    capturedAt: data.capturedAt ?? null,
  };
}

function toBaselineRow(record: BaselineRecord): BaselineRow {
  return {
    id: record.id,
    projectId: record.projectId,
    type: record.type,
    version: record.version,
    status: record.status,
    reason: record.reason,
    approvedAt: record.approvedAt ? record.approvedAt.toISOString() : null,
    approvedBy: record.approvedBy,
    createdAt: record.createdAt.toISOString(),
    createdBy: record.createdBy,
    ...snapshotCounts(record.snapshot),
  };
}

async function loadBaseline(organizationId: string, baselineId: string) {
  const baseline = await prisma.baseline.findFirst({
    where: { id: baselineId, organizationId },
  });
  if (!baseline) {
    throw new AppError("NOT_FOUND", "Baseline não encontrada nesta organização.");
  }
  return baseline;
}

function audit(
  input: ActorContext,
  projectId: string,
  action: string,
  data: { objectId: string; oldValue?: unknown; newValue?: unknown; reason?: string | null }
) {
  return prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      projectId,
      objectType: "Baseline",
      objectId: data.objectId,
      action,
      ...(data.oldValue !== undefined ? { oldValue: data.oldValue as never } : {}),
      ...(data.newValue !== undefined ? { newValue: data.newValue as never } : {}),
      reason: data.reason ?? null,
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });
}

export async function listBaselines(organizationId: string, projectId: string): Promise<BaselineRow[]> {
  await assertScheduleProject(organizationId, projectId);
  const rows = await prisma.baseline.findMany({
    where: { organizationId, projectId },
    orderBy: [{ type: "asc" }, { version: "desc" }],
  });
  return rows.map(toBaselineRow);
}

export async function getBaseline(organizationId: string, baselineId: string) {
  const baseline = await loadBaseline(organizationId, baselineId);
  return { ...toBaselineRow(baseline), snapshot: baseline.snapshot };
}

export interface CreateBaselineInput {
  projectId: string;
  type?: BaselineTypeValue;
  reason?: string;
}

export async function createBaseline(input: ActorContext & CreateBaselineInput) {
  await assertScheduleProject(input.organizationId, input.projectId);
  const type = input.type ?? "SCHEDULE";

  // O snapshot captura o cronograma no momento (E07-US04): atividades,
  // dependências e a data/hora da captura.
  const [activities, dependencies] = await Promise.all([
    listActivities(input.organizationId, input.projectId),
    listDependencies(input.organizationId, input.projectId),
  ]);

  const last = await prisma.baseline.findFirst({
    where: { organizationId: input.organizationId, projectId: input.projectId, type },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const baseline = await prisma.baseline.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      type,
      version: (last?.version ?? 0) + 1,
      status: "DRAFT",
      snapshot: {
        capturedAt: new Date().toISOString(),
        activityCount: activities.length,
        dependencyCount: dependencies.length,
        activities,
        dependencies,
      } as never,
      reason: input.reason?.trim() || null,
      createdBy: input.actorId,
    },
  });

  await audit(input, input.projectId, "CREATE", {
    objectId: baseline.id,
    newValue: { type, version: baseline.version, status: baseline.status },
    reason: baseline.reason,
  });

  return toBaselineRow(baseline);
}

const ALLOWED_TRANSITIONS: Record<BaselineAction, { from: BaselineStatusValue[]; to: BaselineStatusValue }> = {
  SUBMIT: { from: ["DRAFT"], to: "SUBMITTED" },
  APPROVE: { from: ["DRAFT", "SUBMITTED"], to: "APPROVED" },
  REJECT: { from: ["SUBMITTED"], to: "DRAFT" },
};

export interface TransitionBaselineInput {
  baselineId: string;
  action: BaselineAction;
}

export async function transitionBaseline(input: ActorContext & TransitionBaselineInput) {
  const baseline = await loadBaseline(input.organizationId, input.baselineId);
  const rule = ALLOWED_TRANSITIONS[input.action];

  if (baseline.status === "APPROVED" || baseline.status === "SUPERSEDED") {
    throw new AppError(
      "BASELINE_IMMUTABLE",
      "Baseline aprovada é imutável; alteração exige ChangeRequest aprovado."
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
      // Aprovação supersede a baseline aprovada anterior do mesmo tipo.
      await tx.baseline.updateMany({
        where: {
          organizationId: input.organizationId,
          projectId: baseline.projectId,
          type: baseline.type,
          status: "APPROVED",
          id: { not: baseline.id },
        },
        data: { status: "SUPERSEDED" },
      });
    }
    return tx.baseline.update({ where: { id: baseline.id }, data });
  });

  await audit(input, baseline.projectId, input.action, {
    objectId: baseline.id,
    oldValue: { status: baseline.status },
    newValue: { status: updated.status, ...(updated.approvedBy ? { approvedBy: updated.approvedBy } : {}) },
    reason: baseline.reason,
  });

  return toBaselineRow(updated);
}

export async function deleteBaseline(input: ActorContext & { baselineId: string }) {
  const baseline = await loadBaseline(input.organizationId, input.baselineId);

  if (baseline.status === "APPROVED" || baseline.status === "SUPERSEDED") {
    throw new AppError(
      "BASELINE_IMMUTABLE",
      "Baseline aprovada é imutável; alteração exige ChangeRequest aprovado."
    );
  }

  await prisma.baseline.delete({ where: { id: baseline.id } });
  await audit(input, baseline.projectId, "DELETE", {
    objectId: baseline.id,
    oldValue: { type: baseline.type, version: baseline.version, status: baseline.status },
    reason: baseline.reason,
  });

  return { baselineId: baseline.id };
}
