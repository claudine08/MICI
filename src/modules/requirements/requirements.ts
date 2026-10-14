import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import {
  completeRequirementBlocks,
  isRequirementStatus,
  nextRequirementCode,
  regulatoryRequirementBlocks,
  requirementTransition,
  type RequirementStatusValue,
} from "@/modules/requirements/engine";

// Requisitos do projeto (E04, §20, BR-008, BR-015). Toda alteração de conteúdo
// cria uma RequirementRevision (E04-US02) e registra auditoria + evento.

interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

export interface RequirementInput {
  code?: string;
  description: string;
  category?: "OPERATION" | "EQUIPMENT" | "BUILDING" | "ENGINEERING" | "COMPLIANCE" | "SUSTAINABILITY";
  source?: string | null;
  sourceValidUntil?: string | null;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  ownerId?: string | null;
  acceptanceCriteria?: string | null;
  requiredEvidence?: string | null;
  status?: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  wbsNodeId?: string | null;
  documentLinks?: { label: string; url: string }[];
}

function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return new Date(`${value}T00:00:00.000Z`);
}

async function assertProject(organizationId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!project) {
    throw new AppError("NOT_FOUND", "Projeto não encontrado nesta organização.");
  }
}

async function assertOwner(organizationId: string, ownerId: string) {
  const membership = await prisma.organizationMembership.findFirst({
    where: { organizationId, userId: ownerId, status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  if (!membership) {
    throw new AppError("VALIDATION_ERROR", "Responsável não é membro ativo desta organização.");
  }
}

async function assertWbsNode(organizationId: string, projectId: string, wbsNodeId: string) {
  const node = await prisma.wBSNode.findFirst({
    where: { id: wbsNodeId, organizationId, projectId, deletedAt: null },
    select: { id: true },
  });
  if (!node) {
    throw new AppError("VALIDATION_ERROR", "Nó de WBS inválido para este projeto.");
  }
}

function snapshotOf(record: {
  code: string;
  description: string;
  category: string;
  source: string | null;
  sourceValidUntil: Date | null;
  priority: string;
  ownerId: string | null;
  acceptanceCriteria: string | null;
  requiredEvidence: string | null;
  status: string;
  wbsNodeId: string | null;
  documentLinks: unknown;
  lastReviewedAt: Date | null;
  revision: number;
}) {
  return {
    code: record.code,
    description: record.description,
    category: record.category,
    source: record.source,
    sourceValidUntil: record.sourceValidUntil,
    priority: record.priority,
    ownerId: record.ownerId,
    acceptanceCriteria: record.acceptanceCriteria,
    requiredEvidence: record.requiredEvidence,
    status: record.status,
    wbsNodeId: record.wbsNodeId,
    documentLinks: record.documentLinks,
    lastReviewedAt: record.lastReviewedAt,
    revision: record.revision,
  };
}

function assertRules(merged: {
  category: string;
  source: string | null;
  sourceValidUntil: Date | null;
  status: string;
  acceptanceCriteria: string | null;
  evidenceCount: number;
}) {
  const regulatory = regulatoryRequirementBlocks({
    category: merged.category,
    source: merged.source,
    sourceValidUntil: merged.sourceValidUntil,
  });
  if (regulatory.length > 0) {
    throw new AppError("VALIDATION_ERROR", regulatory[0].message, {
      details: { blocks: regulatory },
    });
  }

  if (merged.status === "COMPLETED") {
    const blocks = completeRequirementBlocks({
      status: "COMPLETED",
      acceptanceCriteria: merged.acceptanceCriteria,
      evidenceCount: merged.evidenceCount,
    });
    if (blocks.length > 0) {
      throw new AppError("REQUIREMENT_COMPLETION_BLOCKED", blocks[0].message, {
        details: { blocks },
      });
    }
  }
}

export interface CreateRequirementInput extends RequirementInput {
  projectId: string;
}

export async function createRequirement(input: ActorContext & CreateRequirementInput) {
  await assertProject(input.organizationId, input.projectId);

  const code = input.code?.trim().toUpperCase();
  let finalCode = code;
  if (finalCode) {
    const duplicate = await prisma.requirement.findFirst({
      where: { projectId: input.projectId, code: finalCode, deletedAt: null },
      select: { id: true },
    });
    if (duplicate) {
      throw new AppError("CONFLICT", `Código de requisito "${finalCode}" já existe no projeto.`);
    }
  } else {
    const existing = await prisma.requirement.findMany({
      where: { projectId: input.projectId },
      select: { code: true },
    });
    finalCode = nextRequirementCode(existing.map((item) => item.code));
  }

  if (input.ownerId) await assertOwner(input.organizationId, input.ownerId);
  if (input.wbsNodeId) await assertWbsNode(input.organizationId, input.projectId, input.wbsNodeId);

  const status = input.status ?? "DRAFT";
  if (!requirementTransition("DRAFT", status)) {
    throw new AppError("VALIDATION_ERROR", `Transição inválida: DRAFT → ${status}.`);
  }
  const evidenceCount = 0;
  assertRules({
    category: input.category ?? "OPERATION",
    source: input.source ?? null,
    sourceValidUntil: toDate(input.sourceValidUntil) ?? null,
    status,
    acceptanceCriteria: input.acceptanceCriteria ?? null,
    evidenceCount,
  });

  const requirement = await prisma.requirement.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      code: finalCode!,
      description: input.description.trim(),
      category: input.category ?? "OPERATION",
      source: input.source?.trim() || null,
      sourceValidUntil: toDate(input.sourceValidUntil) ?? null,
      priority: input.priority ?? "MEDIUM",
      ownerId: input.ownerId ?? null,
      acceptanceCriteria: input.acceptanceCriteria?.trim() || null,
      requiredEvidence: input.requiredEvidence?.trim() || null,
      status,
      wbsNodeId: input.wbsNodeId ?? null,
      documentLinks: input.documentLinks ?? [],
      lastReviewedAt: null,
      revision: 1,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });

  await prisma.$transaction(async (tx) => {
    await tx.requirementRevision.create({
      data: {
        organizationId: input.organizationId,
        requirementId: requirement.id,
        revision: 1,
        snapshot: snapshotOf(requirement) as never,
        changeSummary: "Criação",
        createdBy: input.actorId,
      },
    });
    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        projectId: input.projectId,
        objectType: "Requirement",
        objectId: requirement.id,
        action: "CREATE",
        newValue: { code: requirement.code, status: requirement.status },
        correlationId: input.correlationId ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
    await tx.domainEvent.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        actorId: input.actorId,
        eventType: "Requirement.Created",
        aggregateType: "Requirement",
        aggregateId: requirement.id,
        payload: { code: requirement.code, status: requirement.status },
      },
    });
  });

  return requirement;
}

export interface UpdateRequirementInput extends Partial<RequirementInput> {
  requirementId: string;
  changeSummary?: string;
}

export async function updateRequirement(input: ActorContext & UpdateRequirementInput) {
  const current = await prisma.requirement.findFirst({
    where: { id: input.requirementId, organizationId: input.organizationId, deletedAt: null },
  });
  if (!current) {
    throw new AppError("NOT_FOUND", "Requisito não encontrado nesta organização.");
  }

  if (input.code !== undefined) {
    const code = input.code.trim().toUpperCase();
    if (code !== current.code) {
      const duplicate = await prisma.requirement.findFirst({
        where: {
          projectId: current.projectId,
          code,
          deletedAt: null,
          id: { not: current.id },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new AppError("CONFLICT", `Código de requisito "${code}" já existe no projeto.`);
      }
    }
  }

  const nextStatus = input.status ?? current.status;
  if (!isRequirementStatus(nextStatus)) {
    throw new AppError("VALIDATION_ERROR", `Status inválido: ${String(input.status)}.`);
  }
  if (!requirementTransition(current.status as RequirementStatusValue, nextStatus)) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Transição inválida: ${current.status} → ${nextStatus}.`
    );
  }
  if (input.ownerId) await assertOwner(input.organizationId, input.ownerId);
  if (input.wbsNodeId) {
    await assertWbsNode(input.organizationId, current.projectId, input.wbsNodeId);
  }

  const merged = {
    category: input.category ?? current.category,
    source: input.source !== undefined ? input.source?.trim() || null : current.source,
    sourceValidUntil:
      input.sourceValidUntil !== undefined
        ? (toDate(input.sourceValidUntil) ?? null)
        : current.sourceValidUntil,
    status: nextStatus,
    acceptanceCriteria:
      input.acceptanceCriteria !== undefined
        ? input.acceptanceCriteria?.trim() || null
        : current.acceptanceCriteria,
    // BR-008 só é cobrado quando o requisito termina (ou permanece) concluído.
    evidenceCount:
      nextStatus === "COMPLETED"
        ? await prisma.requirementEvidence.count({ where: { requirementId: current.id } })
        : 0,
  };
  assertRules(merged);

  const updated = await prisma.requirement.update({
    where: { id: current.id },
    data: {
      ...(input.code !== undefined ? { code: input.code.trim().toUpperCase() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.source !== undefined ? { source: input.source?.trim() || null } : {}),
      ...(input.sourceValidUntil !== undefined
        ? { sourceValidUntil: toDate(input.sourceValidUntil) ?? null }
        : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
      ...(input.acceptanceCriteria !== undefined
        ? { acceptanceCriteria: input.acceptanceCriteria?.trim() || null }
        : {}),
      ...(input.requiredEvidence !== undefined
        ? { requiredEvidence: input.requiredEvidence?.trim() || null }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.wbsNodeId !== undefined ? { wbsNodeId: input.wbsNodeId } : {}),
      ...(input.documentLinks !== undefined ? { documentLinks: input.documentLinks } : {}),
      updatedBy: input.actorId,
      version: { increment: 1 },
      revision: { increment: 1 },
    },
  });

  await prisma.$transaction(async (tx) => {
    await tx.requirementRevision.create({
      data: {
        organizationId: input.organizationId,
        requirementId: updated.id,
        revision: updated.revision,
        snapshot: snapshotOf(updated) as never,
        changeSummary: input.changeSummary?.trim() || null,
        createdBy: input.actorId,
      },
    });
    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        projectId: current.projectId,
        objectType: "Requirement",
        objectId: updated.id,
        action: "UPDATE",
        oldValue: snapshotOf(current) as never,
        newValue: snapshotOf(updated) as never,
        reason: input.changeSummary?.trim() || null,
        correlationId: input.correlationId ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
    if (current.status !== updated.status) {
      await tx.domainEvent.create({
        data: {
          organizationId: input.organizationId,
          projectId: current.projectId,
          actorId: input.actorId,
          eventType: "Requirement.StatusChanged",
          aggregateType: "Requirement",
          aggregateId: updated.id,
          payload: { code: updated.code, from: current.status, to: updated.status },
        },
      });
    }
  });

  return updated;
}

export async function deleteRequirement(input: ActorContext & { requirementId: string }) {
  const requirement = await prisma.requirement.findFirst({
    where: { id: input.requirementId, organizationId: input.organizationId, deletedAt: null },
    select: { id: true, projectId: true, code: true, status: true },
  });
  if (!requirement) {
    throw new AppError("NOT_FOUND", "Requisito não encontrado nesta organização.");
  }

  await prisma.requirement.update({
    where: { id: requirement.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      projectId: requirement.projectId,
      objectType: "Requirement",
      objectId: requirement.id,
      action: "DELETE",
      oldValue: { code: requirement.code, status: requirement.status },
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });

  return { requirementId: requirement.id };
}

// E04-US04 — vincular evidência ao requisito.
export async function addRequirementEvidence(
  input: ActorContext & { requirementId: string; label: string; url?: string }
) {
  const requirement = await prisma.requirement.findFirst({
    where: { id: input.requirementId, organizationId: input.organizationId, deletedAt: null },
    select: { id: true, projectId: true, code: true },
  });
  if (!requirement) {
    throw new AppError("NOT_FOUND", "Requisito não encontrado nesta organização.");
  }

  const evidence = await prisma.requirementEvidence.create({
    data: {
      organizationId: input.organizationId,
      requirementId: requirement.id,
      label: input.label.trim(),
      url: input.url?.trim() || null,
      createdBy: input.actorId,
    },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      projectId: requirement.projectId,
      objectType: "Requirement",
      objectId: requirement.id,
      action: "ADD_EVIDENCE",
      newValue: { label: evidence.label, url: evidence.url },
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });

  return { evidence };
}

export async function removeRequirementEvidence(
  input: ActorContext & { requirementId: string; evidenceId: string }
) {
  const requirement = await prisma.requirement.findFirst({
    where: { id: input.requirementId, organizationId: input.organizationId, deletedAt: null },
    select: { id: true, projectId: true, code: true },
  });
  if (!requirement) {
    throw new AppError("NOT_FOUND", "Requisito não encontrado nesta organização.");
  }

  const evidence = await prisma.requirementEvidence.findFirst({
    where: { id: input.evidenceId, requirementId: requirement.id },
  });
  if (!evidence) {
    throw new AppError("NOT_FOUND", "Evidência não encontrada.");
  }

  await prisma.requirementEvidence.delete({ where: { id: evidence.id } });
  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      projectId: requirement.projectId,
      objectType: "Requirement",
      objectId: requirement.id,
      action: "REMOVE_EVIDENCE",
      oldValue: { label: evidence.label, url: evidence.url },
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });

  return { evidenceId: evidence.id };
}

// Carimbo de última revisão (last_reviewed_at do DRP, §20).
export async function reviewRequirement(
  input: ActorContext & { requirementId: string; note?: string }
) {
  const requirement = await prisma.requirement.findFirst({
    where: { id: input.requirementId, organizationId: input.organizationId, deletedAt: null },
    select: { id: true, projectId: true, code: true, lastReviewedAt: true },
  });
  if (!requirement) {
    throw new AppError("NOT_FOUND", "Requisito não encontrado nesta organização.");
  }

  const reviewedAt = new Date();
  await prisma.requirement.update({
    where: { id: requirement.id },
    data: { lastReviewedAt: reviewedAt, updatedBy: input.actorId, version: { increment: 1 } },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      projectId: requirement.projectId,
      objectType: "Requirement",
      objectId: requirement.id,
      action: "REVIEW",
      oldValue: { lastReviewedAt: requirement.lastReviewedAt },
      newValue: { lastReviewedAt: reviewedAt },
      reason: input.note?.trim() || null,
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });

  return { requirementId: requirement.id, lastReviewedAt: reviewedAt };
}
