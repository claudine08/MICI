import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import {
  availableInspectionActions,
  inspectionHasEvidence,
  isInspectionEditable,
  nextInspectionStatus,
} from "@/modules/quality/engine";
import {
  assertCodeFree,
  assertFieldLinks,
  assertMember,
  assertQualityProject,
  audit,
  emitDomainEvent,
  findByIdempotentKey,
  nextQualityCode,
  toDate,
  type ActorContext,
} from "@/modules/quality/common";

// Inspeção (E13-US02, §33): executa-se o plano de verificação com CRITÉRIO
// explícito. Sair de EXECUTED para PASSED/FAILED exige evidência adequada —
// foto vinculada ou checklist concluído. Reprovação gera NCR automaticamente
// (E13-US03) e, em FAILED, o CLOSE passa a exigir o NCR encerrado.

export interface CreateInspectionInput {
  projectId: string;
  code?: string;
  title: string;
  description?: string;
  inspectionDate: string;
  inspectorId?: string | null;
  wbsNodeId?: string | null;
  activityId?: string | null;
  criterion: string;
  clientUuid?: string;
}

export interface UpdateInspectionInput {
  inspectionId: string;
  title?: string;
  description?: string | null;
  inspectionDate?: string;
  inspectorId?: string | null;
  wbsNodeId?: string | null;
  activityId?: string | null;
  criterion?: string;
}

export interface InspectionTransitionInput {
  inspectionId: string;
  action: "EXECUTE" | "PASS" | "FAIL" | "CLOSE" | "REOPEN" | "CANCEL";
  reason?: string;
  resultNotes?: string;
}

async function loadLiveInspection(organizationId: string, inspectionId: string) {
  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, organizationId, deletedAt: null },
  });
  if (!inspection) {
    throw new AppError("NOT_FOUND", "Inspeção não encontrada nesta organização.");
  }
  return inspection;
}

async function evidenceCount(inspectionId: string) {
  const [photos, completedChecklists] = await Promise.all([
    prisma.photoEvidence.count({
      where: { inspectionId, deletedAt: null },
    }),
    prisma.checklistExecution.count({
      where: { inspectionId, status: "COMPLETED", deletedAt: null },
    }),
  ]);
  return { photoCount: photos, completedChecklists };
}

export async function createInspection(input: ActorContext & CreateInspectionInput) {
  await assertQualityProject(input.organizationId, input.projectId);

  // Idempotência offline (§38): reenvio do mesmo UUID devolve o original.
  const replay = await findByIdempotentKey(input.projectId, input.clientUuid, (where) =>
    prisma.inspection.findFirst({ where, select: { id: true } })
  );
  if (replay) {
    return prisma.inspection.findFirstOrThrow({ where: { id: replay.id } });
  }

  await assertFieldLinks(input.organizationId, input.projectId, {
    wbsNodeId: input.wbsNodeId,
    activityId: input.activityId,
  });
  if (input.inspectorId) {
    await assertMember(input.organizationId, input.inspectorId);
  }

  let code = input.code?.trim();
  if (code) {
    await assertCodeFree(
      input.projectId,
      code,
      (where) => prisma.inspection.findFirst({ where, select: { id: true } }),
      "de inspeção"
    );
  } else {
    code = await nextQualityCode(input.projectId, "IN");
  }

  const inspection = await prisma.inspection.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      code,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      inspectionDate: toDate(input.inspectionDate)!,
      status: "PLANNED",
      inspectorId: input.inspectorId ?? null,
      wbsNodeId: input.wbsNodeId ?? null,
      activityId: input.activityId ?? null,
      criterion: input.criterion.trim(),
      clientUuid: input.clientUuid ?? null,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });

  await audit(input, input.projectId, "Inspection", "CREATE", {
    objectId: inspection.id,
    newValue: { code: inspection.code, title: inspection.title, inspectionDate: inspection.inspectionDate },
  });
  await emitDomainEvent(
    input,
    input.projectId,
    "Quality.Inspection.Created",
    "Inspection",
    inspection.id,
    { code: inspection.code, title: inspection.title }
  );

  return inspection;
}

export async function updateInspection(input: ActorContext & UpdateInspectionInput) {
  const inspection = await loadLiveInspection(input.organizationId, input.inspectionId);

  if (!isInspectionEditable(inspection.status)) {
    throw new AppError(
      "CONFLICT",
      "Inspeção encerrada/cancelada não aceita alterações — reabra para editar."
    );
  }

  if (input.wbsNodeId !== undefined || input.activityId !== undefined) {
    await assertFieldLinks(input.organizationId, inspection.projectId, {
      wbsNodeId: input.wbsNodeId ?? null,
      activityId: input.activityId ?? null,
    });
  }
  if (input.inspectorId) {
    await assertMember(input.organizationId, input.inspectorId);
  }

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.inspectionDate !== undefined) data.inspectionDate = toDate(input.inspectionDate);
  if (input.inspectorId !== undefined) data.inspectorId = input.inspectorId;
  if (input.wbsNodeId !== undefined) data.wbsNodeId = input.wbsNodeId;
  if (input.activityId !== undefined) data.activityId = input.activityId;
  if (input.criterion !== undefined) data.criterion = input.criterion.trim();
  if (Object.keys(data).length === 0) return inspection;

  data.updatedBy = input.actorId;
  data.version = { increment: 1 };

  const updated = await prisma.inspection.update({ where: { id: inspection.id }, data });

  await audit(input, inspection.projectId, "Inspection", "UPDATE", {
    objectId: inspection.id,
    oldValue: { title: inspection.title, criterion: inspection.criterion },
    newValue: { title: updated.title, criterion: updated.criterion },
  });

  return updated;
}

export async function transitionInspection(input: ActorContext & InspectionTransitionInput) {
  const inspection = await loadLiveInspection(input.organizationId, input.inspectionId);
  const reason = input.reason?.trim() || null;
  const resultNotes = input.resultNotes?.trim() || null;

  if (input.action === "CANCEL" && !reason) {
    throw new AppError("VALIDATION_ERROR", "Informe o motivo do cancelamento.");
  }
  if (input.action === "FAIL" && !resultNotes && !inspection.resultNotes) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Reprovação exige a descrição do não conformidade observado (resultNotes)."
    );
  }

  const next = nextInspectionStatus(inspection.status, input.action);
  if (!next) {
    const allowed = availableInspectionActions(inspection.status);
    throw new AppError(
      "VALIDATION_ERROR",
      `Ação não permitida no status atual (${allowed.join(", ") || "não há ações disponíveis"}).`
    );
  }

  // §33 "evidência adequada": o resultado da inspeção precisa de prova
  // material — foto da evidência ou checklist concluído vinculado.
  if (input.action === "PASS" || input.action === "FAIL") {
    const evidence = await evidenceCount(inspection.id);
    if (!inspectionHasEvidence(evidence)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Registrar o resultado exige evidência: vincule uma foto de evidência ou conclua um checklist nesta inspeção."
      );
    }
  }

  // E13-US03: em FAILED, encerrar exige o NCR da inspeção resolvido
  // (encerrado ou cancelado) — ação corretiva pendente segura o CLOSE.
  if (input.action === "CLOSE" && inspection.status === "FAILED") {
    const unresolved = await prisma.nonConformity.count({
      where: {
        inspectionId: inspection.id,
        deletedAt: null,
        status: { notIn: ["CLOSED", "CANCELLED"] },
      },
    });
    if (unresolved > 0) {
      throw new AppError(
        "CONFLICT",
        "Encerrar inspeção reprovada exige a não conformidade encerrada — conclua a correção e a verificação do NCR."
      );
    }
  }

  const now = new Date();
  const data: Record<string, unknown> = {
    status: next,
    updatedBy: input.actorId,
    version: { increment: 1 },
  };
  if (input.action === "EXECUTE") data.executedAt = now;
  if (input.action === "CLOSE") data.closedAt = now;
  if (input.action === "REOPEN" && inspection.status === "CANCELLED") {
    data.executedAt = null;
    data.closedAt = null;
    data.cancelReason = null;
  }
  if (input.action === "CANCEL") data.cancelReason = reason;
  if (resultNotes) data.resultNotes = resultNotes;

  const updated = await prisma.inspection.update({ where: { id: inspection.id }, data });

  await audit(input, inspection.projectId, "Inspection", input.action, {
    objectId: inspection.id,
    oldValue: { status: inspection.status },
    newValue: { status: updated.status },
    reason,
  });
  await emitDomainEvent(
    input,
    inspection.projectId,
    `Quality.Inspection.${input.action}`,
    "Inspection",
    inspection.id,
    { code: inspection.code, from: inspection.status, to: updated.status }
  );

  // E13-US03: reprovação gera NCR automaticamente (§33 — Failed → Corrective
  // Action). A descrição da não conformidade vem do resultNotes da inspeção.
  if (input.action === "FAIL") {
    const description = (resultNotes || inspection.resultNotes || "").trim();
    await createNonConformityFromInspection(input, inspection, description);
  }

  return updated;
}

// NCR automático da reprovação — separado para manter a transição legível.
async function createNonConformityFromInspection(
  input: ActorContext,
  inspection: { id: string; projectId: string; code: string; title: string },
  description: string
) {
  const code = await nextQualityCode(inspection.projectId, "NC");
  const ncr = await prisma.nonConformity.create({
    data: {
      organizationId: input.organizationId,
      projectId: inspection.projectId,
      code,
      title: `Não conformidade — ${inspection.title}`.slice(0, 200),
      description: description || `Reprovação da inspeção ${inspection.code}.`,
      status: "OPEN",
      inspectionId: inspection.id,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });

  await audit(input, inspection.projectId, "NonConformity", "CREATE", {
    objectId: ncr.id,
    newValue: { code: ncr.code, title: ncr.title, inspectionId: inspection.id, auto: true },
  });
  await emitDomainEvent(
    input,
    inspection.projectId,
    "Quality.NonConformity.Created",
    "NonConformity",
    ncr.id,
    { code: ncr.code, inspectionId: inspection.id, auto: true }
  );

  return ncr;
}

export async function deleteInspection(input: ActorContext & { inspectionId: string }) {
  const inspection = await loadLiveInspection(input.organizationId, input.inspectionId);

  // Só se sai do plano — depois de executada, o registro é histórico
  // (cancelamento preserva as evidências vinculadas).
  if (inspection.status !== "PLANNED" && inspection.status !== "CANCELLED") {
    throw new AppError(
      "CONFLICT",
      "Inspeção executada não pode ser excluída — cancele-a para preservar a trilha."
    );
  }

  await prisma.inspection.update({
    where: { id: inspection.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId },
  });
  await audit(input, inspection.projectId, "Inspection", "DELETE", {
    objectId: inspection.id,
    oldValue: { code: inspection.code, title: inspection.title },
  });
  await emitDomainEvent(
    input,
    inspection.projectId,
    "Quality.Inspection.Deleted",
    "Inspection",
    inspection.id,
    { code: inspection.code }
  );

  return { inspectionId: inspection.id };
}
