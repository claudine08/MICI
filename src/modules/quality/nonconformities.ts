import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import {
  isNonConformityEditable,
  nextNonConformityStatus,
  availableNonConformityActions,
} from "@/modules/quality/engine";
import {
  assertCodeFree,
  assertQualityProject,
  audit,
  emitDomainEvent,
  nextQualityCode,
  findByIdempotentKey,
  type ActorContext,
} from "@/modules/quality/common";

// Não conformidade — NCR (E13-US03, §33). Nasce automaticamente quando a
// inspeção é reprovada (FAIL) e gateia o encerramento dela; também pode ser
// registrada manualmente. Fluxo: OPEN → CORRECTION → VERIFICATION → CLOSED.

export interface CreateNonConformityInput {
  projectId: string;
  code?: string;
  title: string;
  description: string;
  inspectionId?: string | null;
  clientUuid?: string;
}

export interface UpdateNonConformityInput {
  nonConformityId: string;
  title?: string;
  description?: string;
}

export interface NonConformityTransitionInput {
  nonConformityId: string;
  action: string;
  reason?: string;
  correctionNotes?: string;
  verificationNotes?: string;
}

async function loadLiveNonConformity(organizationId: string, nonConformityId: string) {
  const ncr = await prisma.nonConformity.findFirst({
    where: { id: nonConformityId, organizationId, deletedAt: null },
  });
  if (!ncr) {
    throw new AppError("NOT_FOUND", "Não conformidade não encontrada nesta organização.");
  }
  return ncr;
}

// Vínculo com inspeção precisa ser inspeção viva do mesmo projeto.
async function assertInspection(organizationId: string, projectId: string, inspectionId: string) {
  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, organizationId, projectId, deletedAt: null },
    select: { id: true },
  });
  if (!inspection) {
    throw new AppError("VALIDATION_ERROR", "Inspeção inválida para este projeto.");
  }
}

export async function createNonConformity(input: ActorContext & CreateNonConformityInput) {
  await assertQualityProject(input.organizationId, input.projectId);

  const replay = await findByIdempotentKey(input.projectId, input.clientUuid, (where) =>
    prisma.nonConformity.findFirst({ where, select: { id: true } })
  );
  if (replay) {
    return prisma.nonConformity.findFirstOrThrow({ where: { id: replay.id } });
  }

  if (input.inspectionId) {
    await assertInspection(input.organizationId, input.projectId, input.inspectionId);
  }

  let code = input.code?.trim();
  if (code) {
    await assertCodeFree(
      input.projectId,
      code,
      (where) => prisma.nonConformity.findFirst({ where, select: { id: true } }),
      "de não conformidade"
    );
  } else {
    code = await nextQualityCode(input.projectId, "NC");
  }

  const ncr = await prisma.nonConformity.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      code,
      title: input.title.trim(),
      description: input.description.trim(),
      status: "OPEN",
      inspectionId: input.inspectionId ?? null,
      clientUuid: input.clientUuid ?? null,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });

  await audit(input, input.projectId, "NonConformity", "CREATE", {
    objectId: ncr.id,
    newValue: { code: ncr.code, title: ncr.title, inspectionId: ncr.inspectionId },
  });
  await emitDomainEvent(
    input,
    input.projectId,
    "Quality.NonConformity.Created",
    "NonConformity",
    ncr.id,
    { code: ncr.code, title: ncr.title }
  );

  return ncr;
}

export async function updateNonConformity(
  input: ActorContext & UpdateNonConformityInput
) {
  const ncr = await loadLiveNonConformity(input.organizationId, input.nonConformityId);

  if (!isNonConformityEditable(ncr.status)) {
    throw new AppError(
      "CONFLICT",
      "Não conformidade em verificação/encerrada não aceita alterações de conteúdo."
    );
  }

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.description !== undefined) data.description = input.description.trim();
  if (Object.keys(data).length === 0) return ncr;

  data.updatedBy = input.actorId;
  data.version = { increment: 1 };

  const updated = await prisma.nonConformity.update({
    where: { id: ncr.id },
    data,
  });

  await audit(input, ncr.projectId, "NonConformity", "UPDATE", {
    objectId: ncr.id,
    oldValue: { title: ncr.title },
    newValue: { title: updated.title },
  });

  return updated;
}

export async function transitionNonConformity(
  input: ActorContext & NonConformityTransitionInput
) {
  const ncr = await loadLiveNonConformity(input.organizationId, input.nonConformityId);
  const reason = input.reason?.trim() || null;
  const correctionNotes = input.correctionNotes?.trim() || null;
  const verificationNotes = input.verificationNotes?.trim() || null;

  if (input.action === "CANCEL" && !reason) {
    throw new AppError("VALIDATION_ERROR", "Informe o motivo do cancelamento.");
  }
  if (input.action === "SUBMIT" && !correctionNotes && !ncr.correctionNotes) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Enviar para verificação exige descrever a correção aplicada (correctionNotes)."
    );
  }
  if (input.action === "VERIFY" && !verificationNotes && !ncr.verificationNotes) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Verificar efetividade exige descrever a verificação (verificationNotes)."
    );
  }

  const next = nextNonConformityStatus(ncr.status, input.action as never);
  if (!next) {
    const allowed = availableNonConformityActions(ncr.status);
    throw new AppError(
      "VALIDATION_ERROR",
      `Ação não permitida no status atual (${allowed.join(", ") || "não há ações disponíveis"}).`
    );
  }

  const now = new Date();
  const data: Record<string, unknown> = {
    status: next,
    updatedBy: input.actorId,
    version: { increment: 1 },
  };
  if (input.action === "SUBMIT") data.correctedAt = now;
  if (input.action === "VERIFY") {
    data.verifiedAt = now;
    data.closedAt = now;
  }
  if (input.action === "CANCEL") data.cancelReason = reason;
  if (correctionNotes) data.correctionNotes = correctionNotes;
  if (verificationNotes) data.verificationNotes = verificationNotes;
  if (input.action === "REOPEN" && ncr.status === "CLOSED") {
    data.closedAt = null;
    data.verifiedAt = null;
  }

  const updated = await prisma.nonConformity.update({
    where: { id: ncr.id },
    data,
  });

  await audit(input, ncr.projectId, "NonConformity", input.action, {
    objectId: ncr.id,
    oldValue: { status: ncr.status },
    newValue: { status: updated.status },
    reason,
  });
  await emitDomainEvent(
    input,
    ncr.projectId,
    `Quality.NonConformity.${input.action}`,
    "NonConformity",
    ncr.id,
    { code: ncr.code, from: ncr.status, to: updated.status }
  );

  return updated;
}

export async function deleteNonConformity(input: ActorContext & { nonConformityId: string }) {
  const ncr = await loadLiveNonConformity(input.organizationId, input.nonConformityId);

  // NCR aberto/em correção pode ser excluído; depois de verificação vira
  // histórico (cancele para preservar a trilha).
  if (ncr.status !== "OPEN" && ncr.status !== "CORRECTION") {
    throw new AppError(
      "CONFLICT",
      "Não conformidade em verificação/encerrada não pode ser excluída — cancele para preservar a trilha."
    );
  }

  await prisma.nonConformity.update({
    where: { id: ncr.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId },
  });
  await audit(input, ncr.projectId, "NonConformity", "DELETE", {
    objectId: ncr.id,
    oldValue: { code: ncr.code, title: ncr.title },
  });
  await emitDomainEvent(
    input,
    ncr.projectId,
    "Quality.NonConformity.Deleted",
    "NonConformity",
    ncr.id,
    { code: ncr.code }
  );

  return { nonConformityId: ncr.id };
}
