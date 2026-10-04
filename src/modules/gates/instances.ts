import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/core/errors";
import {
  approveBlocks,
  gateTransition,
  isGateAction,
  type CriterionSnapshot,
  type GateAction,
  type GateStatusValue,
} from "./engine";

// GateInstance (§17): por projeto, com snapshot da configuração (§15.1).
// Transições seguem a máquina de estados (§16.3); aprovação exige critérios e
// evidências (BR-002) e gera auditoria (BR-011).

interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

// Cria as instâncias faltantes para as definições ativas da organização.
export async function ensureProjectGateInstances(
  organizationId: string,
  projectId: string,
  actorId: string
): Promise<void> {
  const definitions = await prisma.gateDefinition.findMany({
    where: { organizationId, deletedAt: null },
    include: { criteria: { orderBy: { orderIndex: "asc" } } },
    orderBy: { orderIndex: "asc" },
  });
  const existing = await prisma.gateInstance.findMany({
    where: { projectId },
    select: { gateDefinitionId: true },
  });
  const have = new Set(existing.map((instance) => instance.gateDefinitionId));

  for (const definition of definitions) {
    if (have.has(definition.id)) continue;
    const snapshot: CriterionSnapshot[] = definition.criteria.map((criterion) => ({
      code: criterion.code,
      description: criterion.description,
      required: criterion.required,
      orderIndex: criterion.orderIndex,
    }));
    await prisma.gateInstance.create({
      data: {
        organizationId,
        projectId,
        gateDefinitionId: definition.id,
        criteriaSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
  }
}

export interface GateEvidenceRow {
  id: string;
  label: string;
  url: string | null;
  createdBy: string | null;
  createdAt: Date;
}

export interface GateApprovalRow {
  id: string;
  approverId: string;
  decision: string;
  comment: string | null;
  createdAt: Date;
}

export interface GateInstanceRow {
  id: string;
  projectId: string;
  code: string;
  name: string;
  description: string | null;
  phase: string;
  required: boolean;
  requiresEvidence: boolean;
  minimumApprovals: number;
  status: GateStatusValue;
  decision: string | null;
  decisionReason: string | null;
  decidedAt: Date | null;
  startedAt: Date | null;
  submittedAt: Date | null;
  updatedAt: Date;
  criteria: CriterionSnapshot[];
  results: Record<string, { completed: boolean; note: string | null }>;
  evidences: GateEvidenceRow[];
  approvals: GateApprovalRow[];
}

type InstanceRecord = {
  id: string;
  organizationId: string;
  projectId: string;
  gateDefinitionId: string;
  status: GateStatusValue;
  criteriaSnapshot: unknown;
  decision: string | null;
  decisionReason: string | null;
  decidedAt: Date | null;
  startedAt: Date | null;
  submittedAt: Date | null;
  updatedAt: Date;
  definition: {
    code: string;
    name: string;
    description: string | null;
    phase: string;
    required: boolean;
    requiresEvidence: boolean;
    minimumApprovals: number;
  };
  criterionResults: { criterionCode: string; completed: boolean; note: string | null }[];
  evidences: GateEvidenceRow[];
  approvals: GateApprovalRow[];
};

function parseSnapshot(value: unknown): CriterionSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value as CriterionSnapshot[];
}

function toRow(instance: InstanceRecord): GateInstanceRow {
  const results: Record<string, { completed: boolean; note: string | null }> = {};
  for (const result of instance.criterionResults) {
    results[result.criterionCode] = { completed: result.completed, note: result.note };
  }
  return {
    id: instance.id,
    projectId: instance.projectId,
    code: instance.definition.code,
    name: instance.definition.name,
    description: instance.definition.description,
    phase: instance.definition.phase,
    required: instance.definition.required,
    requiresEvidence: instance.definition.requiresEvidence,
    minimumApprovals: instance.definition.minimumApprovals,
    status: instance.status,
    decision: instance.decision,
    decisionReason: instance.decisionReason,
    decidedAt: instance.decidedAt,
    startedAt: instance.startedAt,
    submittedAt: instance.submittedAt,
    updatedAt: instance.updatedAt,
    criteria: parseSnapshot(instance.criteriaSnapshot),
    results,
    evidences: instance.evidences,
    approvals: instance.approvals,
  };
}

const instanceInclude = {
  definition: true,
  criterionResults: true,
  evidences: { orderBy: { createdAt: "asc" as const } },
  approvals: { orderBy: { createdAt: "asc" as const } },
} as const;

async function loadInstance(
  organizationId: string,
  instanceId: string
): Promise<InstanceRecord> {
  const instance = await prisma.gateInstance.findFirst({
    where: { id: instanceId, organizationId },
    include: instanceInclude,
  });
  if (!instance) {
    throw new AppError("NOT_FOUND", "Gate não encontrado nesta organização.");
  }
  return instance as unknown as InstanceRecord;
}

// Lista as instâncias do projeto, criando as faltantes (definitions ativas).
export async function listProjectGateInstances(
  organizationId: string,
  projectId: string,
  actorId: string
): Promise<GateInstanceRow[]> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!project) {
    throw new AppError("NOT_FOUND", "Projeto não encontrado nesta organização.");
  }
  await ensureProjectGateInstances(organizationId, projectId, actorId);
  const instances = await prisma.gateInstance.findMany({
    where: { projectId, organizationId },
    include: instanceInclude,
    orderBy: { definition: { orderIndex: "asc" } },
  });
  return (instances as unknown as InstanceRecord[]).map(toRow);
}

export interface TransitionGateInput extends ActorContext {
  instanceId: string;
  action: string;
  reason?: string;
}

export async function transitionGate(input: TransitionGateInput) {
  if (!isGateAction(input.action)) {
    throw new AppError("VALIDATION_ERROR", `Ação de gate inválida: ${input.action}.`);
  }
  const action: GateAction = input.action;

  const instance = await loadInstance(input.organizationId, input.instanceId);
  const project = await prisma.project.findFirst({
    where: { id: instance.projectId, organizationId: input.organizationId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!project) {
    throw new AppError("NOT_FOUND", "Projeto não encontrado nesta organização.");
  }

  const target = gateTransition(action, instance.status);
  if (!target) {
    throw new AppError(
      "CONFLICT",
      `Transição inválida: ${instance.status} não permite "${action}".`
    );
  }

  if ((action === "reject" || action === "waive") && !input.reason?.trim()) {
    throw new AppError(
      "VALIDATION_ERROR",
      action === "waive"
        ? "Dispensa (WAIVED) exige justificativa (§17.2)."
        : "Rejeição exige justificativa."
    );
  }

  // BR-002 / E06-US05: aprovação exige critérios completos + evidência obrigatória.
  if (action === "approve") {
    const snapshot = parseSnapshot(instance.criteriaSnapshot);
    const completedCodes = new Set(
      instance.criterionResults.filter((r) => r.completed).map((r) => r.criterionCode)
    );
    const blocks = approveBlocks({
      snapshot,
      completedCodes,
      evidenceCount: instance.evidences.length,
      requiresEvidence: instance.definition.requiresEvidence,
    });
    if (blocks.length > 0) {
      const [first] = blocks;
      throw new AppError(first.code, first.message, {
        details: {
          blocks: blocks.map((block) => ({
            code: block.code,
            message: block.message,
            ...(block.pendingCriteria ? { pendingCriteria: block.pendingCriteria } : {}),
          })),
        },
      });
    }
    const alreadyApproved = instance.approvals.some(
      (approval) =>
        approval.approverId === input.actorId && approval.decision === "APPROVED"
    );
    if (alreadyApproved) {
      throw new AppError("CONFLICT", "Você já aprovou este gate.");
    }
  }

  const now = new Date();
  const decidedActions = action === "approve" || action === "reject" || action === "waive";

  await prisma.$transaction(async (tx) => {
    if (action === "approve" || action === "reject") {
      await tx.gateApproval.create({
        data: {
          organizationId: input.organizationId,
          gateInstanceId: instance.id,
          approverId: input.actorId,
          decision: action === "approve" ? "APPROVED" : "REJECTED",
          comment: input.reason?.trim() || null,
        },
      });
    }

    // Status final: aprovação só conclui ao atingir minimumApprovals.
    let finalStatus: string = target;
    if (action === "approve") {
      const approvals = await tx.gateApproval.count({
        where: { gateInstanceId: instance.id, decision: "APPROVED" },
      });
      if (approvals < instance.definition.minimumApprovals) {
        finalStatus = instance.status; // permanece UNDER_REVIEW
      }
    }
    const decided = decidedActions && finalStatus === target;

    const data: Record<string, unknown> = {
      status: finalStatus,
      updatedBy: input.actorId,
      version: { increment: 1 },
    };
    if (action === "start") data.startedAt = now;
    if (action === "submit") data.submittedAt = now;
    if (decided) {
      data.decision = target;
      data.decisionReason = input.reason?.trim() || null;
      data.decidedBy = input.actorId;
      data.decidedAt = now;
    }

    await tx.gateInstance.update({
      where: { id: instance.id },
      data: data as never,
    });

    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        projectId: instance.projectId,
        objectType: "GateInstance",
        objectId: instance.id,
        action: action.toUpperCase(),
        oldValue: { status: instance.status },
        newValue: {
          status: finalStatus,
          ...(input.reason ? { reason: input.reason.trim() } : {}),
        },
        reason: input.reason?.trim() || null,
        correlationId: input.correlationId ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });

    if (decided) {
      await tx.domainEvent.create({
        data: {
          organizationId: input.organizationId,
          projectId: instance.projectId,
          actorId: input.actorId,
          eventType: "Gate.Decided",
          aggregateType: "GateInstance",
          aggregateId: instance.id,
          payload: {
            code: instance.definition.code,
            decision: finalStatus,
            ...(input.reason ? { reason: input.reason.trim() } : {}),
          },
        },
      });
    }
  });

  const updated = await loadInstance(input.organizationId, input.instanceId);
  return toRow(updated);
}

export interface SetGateCriteriaInput extends ActorContext {
  instanceId: string;
  results: { criterionCode: string; completed: boolean; note?: string }[];
}

export async function setGateCriteria(input: SetGateCriteriaInput) {
  const instance = await loadInstance(input.organizationId, input.instanceId);
  if (instance.status === "NOT_STARTED") {
    throw new AppError("CONFLICT", "Inicie o gate antes de marcar critérios.");
  }
  if (instance.status === "APPROVED" || instance.status === "WAIVED") {
    throw new AppError("CONFLICT", "Gate decidido: critérios não podem ser alterados.");
  }

  const snapshot = parseSnapshot(instance.criteriaSnapshot);
  const validCodes = new Set(snapshot.map((criterion) => criterion.code));
  for (const result of input.results) {
    if (!validCodes.has(result.criterionCode)) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Critério desconhecido: ${result.criterionCode}.`
      );
    }
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const result of input.results) {
      await tx.gateCriterionResult.upsert({
        where: {
          gateInstanceId_criterionCode: {
            gateInstanceId: instance.id,
            criterionCode: result.criterionCode,
          },
        },
        create: {
          gateInstanceId: instance.id,
          criterionCode: result.criterionCode,
          completed: result.completed,
          note: result.note?.trim() || null,
          completedBy: result.completed ? input.actorId : null,
          completedAt: result.completed ? now : null,
        },
        update: {
          completed: result.completed,
          note: result.note?.trim() || null,
          completedBy: result.completed ? input.actorId : null,
          completedAt: result.completed ? now : null,
        },
      });
    }

    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        projectId: instance.projectId,
        objectType: "GateInstance",
        objectId: instance.id,
        action: "CRITERIA_UPDATE",
        newValue: { results: input.results },
        correlationId: input.correlationId ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
  });

  const updated = await loadInstance(input.organizationId, input.instanceId);
  return toRow(updated);
}

export interface AddGateEvidenceInput extends ActorContext {
  instanceId: string;
  label: string;
  url?: string;
}

export async function addGateEvidence(input: AddGateEvidenceInput) {
  const instance = await loadInstance(input.organizationId, input.instanceId);
  if (instance.status === "NOT_STARTED") {
    throw new AppError("CONFLICT", "Inicie o gate antes de registrar evidências.");
  }
  if (instance.status === "APPROVED" || instance.status === "WAIVED") {
    throw new AppError(
      "CONFLICT",
      "Gate decidido: novas evidências não são aceitas (BR-002)."
    );
  }

  const evidence = await prisma.$transaction(async (tx) => {
    const created = await tx.gateEvidence.create({
      data: {
        organizationId: input.organizationId,
        gateInstanceId: instance.id,
        label: input.label.trim(),
        url: input.url?.trim() || null,
        createdBy: input.actorId,
      },
    });
    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        projectId: instance.projectId,
        objectType: "GateInstance",
        objectId: instance.id,
        action: "ADD_EVIDENCE",
        newValue: { label: created.label, url: created.url },
        correlationId: input.correlationId ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
    return created;
  });

  const updated = await loadInstance(input.organizationId, input.instanceId);
  return { evidence, gate: toRow(updated) };
}

export async function removeGateEvidence(
  input: ActorContext & { instanceId: string; evidenceId: string }
) {
  const instance = await loadInstance(input.organizationId, input.instanceId);
  if (instance.status === "APPROVED" || instance.status === "WAIVED") {
    throw new AppError("CONFLICT", "Gate decidido: evidências não podem ser removidas.");
  }
  const evidence = instance.evidences.find((item) => item.id === input.evidenceId);
  if (!evidence) {
    throw new AppError("NOT_FOUND", "Evidência não encontrada.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.gateEvidence.delete({ where: { id: evidence.id } });
    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        projectId: instance.projectId,
        objectType: "GateInstance",
        objectId: instance.id,
        action: "REMOVE_EVIDENCE",
        oldValue: { label: evidence.label, url: evidence.url },
        correlationId: input.correlationId ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
  });

  const updated = await loadInstance(input.organizationId, input.instanceId);
  return toRow(updated);
}
