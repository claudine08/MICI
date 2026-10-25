import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import {
  availableChecklistExecutionActions,
  isChecklistExecutionEditable,
  nextChecklistExecutionStatus,
  parseChecklistItems,
  summarizeChecklistItems,
} from "@/modules/quality/engine";
import {
  assertCodeFree,
  assertMember,
  assertQualityProject,
  audit,
  emitDomainEvent,
  findByIdempotentKey,
  nextQualityCode,
  type ActorContext,
} from "@/modules/quality/common";

// Execução de checklist (E13-US01): um modelo copiado para uma data de
// inspeção. O snapshot dos itens congelada na criação e só recebe RESPOSTAS
// (result/note) enquanto estiver em rascunho — a conclusão é um evento
// auditado (§33 "atingir o critério e possuir evidência adequada").

export interface CreateChecklistExecutionInput {
  projectId: string;
  code?: string;
  templateId: string;
  inspectionId?: string | null;
  inspectorId?: string | null;
  notes?: string;
  clientUuid?: string;
}

export interface UpdateChecklistExecutionInput {
  executionId: string;
  items?: { key: string; text: string; required?: boolean; result?: "PASS" | "FAIL" | "NA" | null; note?: string | null }[];
  inspectorId?: string | null;
  notes?: string | null;
  inspectionId?: string | null;
}

export interface ChecklistExecutionTransitionInput {
  executionId: string;
  action: "COMPLETE" | "REOPEN" | "CANCEL";
  reason?: string;
}

async function loadLiveExecution(organizationId: string, executionId: string) {
  const execution = await prisma.checklistExecution.findFirst({
    where: { id: executionId, organizationId, deletedAt: null },
  });
  if (!execution) {
    throw new AppError("NOT_FOUND", "Execução de checklist não encontrada nesta organização.");
  }
  return execution;
}

async function assertInspectionLink(
  organizationId: string,
  projectId: string,
  inspectionId: string | null | undefined
) {
  if (!inspectionId) return;
  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, organizationId, projectId, deletedAt: null },
    select: { status: true },
  });
  if (!inspection) {
    throw new AppError("VALIDATION_ERROR", "Inspeção inválida para este projeto.");
  }
  if (inspection.status === "CANCELLED") {
    throw new AppError("VALIDATION_ERROR", "Não é possível vincular execução a inspeção cancelada.");
  }
}

export async function createChecklistExecution(input: ActorContext & CreateChecklistExecutionInput) {
  await assertQualityProject(input.organizationId, input.projectId);

  // Idempotência offline (§38): reenvio do mesmo UUID devolve o original.
  const replay = await findByIdempotentKey(input.projectId, input.clientUuid, (where) =>
    prisma.checklistExecution.findFirst({ where, select: { id: true } })
  );
  if (replay) {
    return prisma.checklistExecution.findFirstOrThrow({ where: { id: replay.id } });
  }

  const template = await prisma.checklistTemplate.findFirst({
    where: { id: input.templateId, organizationId: input.organizationId, projectId: input.projectId, deletedAt: null },
  });
  if (!template) {
    throw new AppError("NOT_FOUND", "Modelo de checklist não encontrado neste projeto.");
  }
  const templateItems = parseChecklistItems(template.items);

  await assertInspectionLink(input.organizationId, input.projectId, input.inspectionId);
  if (input.inspectorId) {
    await assertMember(input.organizationId, input.inspectorId);
  }

  let code = input.code?.trim();
  if (code) {
    await assertCodeFree(
      input.projectId,
      code,
      (where) => prisma.checklistExecution.findFirst({ where, select: { id: true } }),
      "de execução"
    );
  } else {
    code = await nextQualityCode(input.projectId, "CE");
  }

  // Snapshot: mesmos itens do modelo, ainda sem resposta.
  const items = templateItems.map((item) => ({
    key: item.key,
    text: item.text,
    required: item.required,
    result: null,
    note: null,
  }));

  const execution = await prisma.checklistExecution.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      code,
      templateId: template.id,
      templateCode: template.code,
      templateName: template.name,
      inspectionId: input.inspectionId ?? null,
      status: "DRAFT",
      items: items as never,
      inspectorId: input.inspectorId ?? null,
      notes: input.notes?.trim() || null,
      clientUuid: input.clientUuid ?? null,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });

  await audit(input, input.projectId, "ChecklistExecution", "CREATE", {
    objectId: execution.id,
    newValue: { code: execution.code, templateCode: template.code, items: items.length },
  });
  await emitDomainEvent(
    input,
    input.projectId,
    "Quality.ChecklistExecution.Created",
    "ChecklistExecution",
    execution.id,
    { code: execution.code, templateCode: template.code }
  );

  return execution;
}

export async function updateChecklistExecution(
  input: ActorContext & UpdateChecklistExecutionInput
) {
  const execution = await loadLiveExecution(input.organizationId, input.executionId);

  if (!isChecklistExecutionEditable(execution.status)) {
    throw new AppError(
      "CONFLICT",
      "Execução concluída/cancelada não aceita alterações — reabra para editar."
    );
  }

  if (input.inspectorId) {
    await assertMember(input.organizationId, input.inspectorId);
  }
  if (input.inspectionId !== undefined) {
    await assertInspectionLink(input.organizationId, execution.projectId, input.inspectionId);
  }

  const data: Record<string, unknown> = {};
  if (input.items !== undefined) data.items = input.items as never;
  if (input.inspectorId !== undefined) data.inspectorId = input.inspectorId;
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;
  if (input.inspectionId !== undefined) data.inspectionId = input.inspectionId;
  if (Object.keys(data).length === 0) return execution;

  data.updatedBy = input.actorId;
  data.version = { increment: 1 };

  const updated = await prisma.checklistExecution.update({
    where: { id: execution.id },
    data,
  });

  await audit(input, execution.projectId, "ChecklistExecution", "UPDATE", {
    objectId: execution.id,
    oldValue: { items: execution.items },
    newValue: { items: updated.items },
  });

  return updated;
}

export async function transitionChecklistExecution(
  input: ActorContext & ChecklistExecutionTransitionInput
) {
  const execution = await loadLiveExecution(input.organizationId, input.executionId);
  const reason = input.reason?.trim() || null;

  if (input.action === "CANCEL" && !reason) {
    throw new AppError("VALIDATION_ERROR", "Informe o motivo do cancelamento.");
  }

  const next = nextChecklistExecutionStatus(execution.status, input.action);
  if (!next) {
    const allowed = availableChecklistExecutionActions(execution.status);
    throw new AppError(
      "VALIDATION_ERROR",
      `Ação não permitida no status atual (${allowed.join(", ") || "não há ações disponíveis"}).`
    );
  }

  const items = parseChecklistItems(execution.items);
  const summary = summarizeChecklistItems(items);

  if (input.action === "COMPLETE" && !summary.complete) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Todos os itens obrigatórios precisam de resposta antes de concluir."
    );
  }

  const data: Record<string, unknown> = {
    status: next,
    updatedBy: input.actorId,
    version: { increment: 1 },
  };
  if (input.action === "COMPLETE") data.completedAt = new Date();
  if (input.action === "REOPEN") {
    data.completedAt = null;
    data.cancelReason = null;
  }
  if (input.action === "CANCEL") data.cancelReason = reason;

  const updated = await prisma.checklistExecution.update({
    where: { id: execution.id },
    data,
  });

  await audit(input, execution.projectId, "ChecklistExecution", input.action, {
    objectId: execution.id,
    oldValue: { status: execution.status },
    newValue: { status: updated.status },
    reason,
  });
  await emitDomainEvent(
    input,
    execution.projectId,
    `Quality.ChecklistExecution.${input.action}`,
    "ChecklistExecution",
    execution.id,
    { code: execution.code, from: execution.status, to: updated.status }
  );

  return updated;
}

export async function deleteChecklistExecution(input: ActorContext & { executionId: string }) {
  const execution = await loadLiveExecution(input.organizationId, input.executionId);

  // Concluída = evidência de inspeção — preserva a trilha (reabra e cancele
  // para remover de circulação sem apagar o histórico).
  if (execution.status === "COMPLETED") {
    throw new AppError(
      "CONFLICT",
      "Execução concluída não pode ser excluída — reabra e cancele para preservar a auditoria."
    );
  }

  await prisma.checklistExecution.update({
    where: { id: execution.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId },
  });
  await audit(input, execution.projectId, "ChecklistExecution", "DELETE", {
    objectId: execution.id,
    oldValue: { code: execution.code, status: execution.status },
  });
  await emitDomainEvent(
    input,
    execution.projectId,
    "Quality.ChecklistExecution.Deleted",
    "ChecklistExecution",
    execution.id,
    { code: execution.code }
  );

  return { executionId: execution.id };
}
