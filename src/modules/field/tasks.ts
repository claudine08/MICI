import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { nextTaskStatus, type TaskAction } from "@/modules/field/engine";
import {
  assertCodeFree,
  assertFieldLinks,
  assertMember,
  audit,
  emitDomainEvent,
  nextFieldCode,
  toDate,
  type ActorContext,
} from "@/modules/field/common";
import { assertFieldProject } from "@/modules/field/selectors";

// Tarefa de campo (E12-US03): poucos campos para uso com luvas (§38).
// Ciclo OPEN → IN_PROGRESS → DONE com BLOCKED/CANCELLED e vínculos
// opcionais a diário, atividade e WBS.

export interface CreateTaskInput {
  projectId: string;
  code?: string;
  title: string;
  description?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  assigneeId?: string | null;
  dueDate?: string;
  wbsNodeId?: string | null;
  activityId?: string | null;
  diaryId?: string | null;
}

async function loadLiveTask(organizationId: string, taskId: string) {
  const task = await prisma.fieldTask.findFirst({
    where: { id: taskId, organizationId, deletedAt: null },
  });
  if (!task) {
    throw new AppError("NOT_FOUND", "Tarefa não encontrada nesta organização.");
  }
  return task;
}

async function assertDiary(organizationId: string, projectId: string, diaryId: string) {
  const diary = await prisma.fieldDiary.findFirst({
    where: { id: diaryId, organizationId, projectId, deletedAt: null },
    select: { id: true },
  });
  if (!diary) {
    throw new AppError("VALIDATION_ERROR", "Diário inválido para este projeto.");
  }
}

export async function createTask(input: ActorContext & CreateTaskInput) {
  await assertFieldProject(input.organizationId, input.projectId);
  if (input.assigneeId) await assertMember(input.organizationId, input.assigneeId);
  await assertFieldLinks(input.organizationId, input.projectId, {
    wbsNodeId: input.wbsNodeId,
    activityId: input.activityId,
  });
  if (input.diaryId) await assertDiary(input.organizationId, input.projectId, input.diaryId);

  let code = input.code?.trim();
  if (code) {
    await assertCodeFree(
      input.projectId,
      code,
      (where) => prisma.fieldTask.findFirst({ where, select: { id: true } }),
      "de tarefa"
    );
  } else {
    code = await nextFieldCode(input.projectId, "FT");
  }

  const task = await prisma.fieldTask.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      diaryId: input.diaryId ?? null,
      code,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      priority: input.priority ?? "MEDIUM",
      assigneeId: input.assigneeId ?? null,
      dueDate: toDate(input.dueDate),
      wbsNodeId: input.wbsNodeId ?? null,
      activityId: input.activityId ?? null,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });

  await audit(input, input.projectId, "FieldTask", "CREATE", {
    objectId: task.id,
    newValue: { code: task.code, title: task.title, priority: task.priority },
  });
  await emitDomainEvent(input, input.projectId, "FieldTask.Created", "FieldTask", task.id, {
    code: task.code,
    title: task.title,
  });

  return task;
}

export interface UpdateTaskInput extends Partial<Omit<CreateTaskInput, "projectId">> {
  taskId: string;
}

export async function updateTask(input: ActorContext & UpdateTaskInput) {
  const task = await loadLiveTask(input.organizationId, input.taskId);

  if (task.status === "DONE" || task.status === "CANCELLED") {
    throw new AppError(
      "FIELD_INVALID_STATE",
      "Tarefa concluída/cancelada é histórico — reabra para alterar."
    );
  }

  if (input.assigneeId) await assertMember(input.organizationId, input.assigneeId);
  if (input.wbsNodeId !== undefined || input.activityId !== undefined) {
    await assertFieldLinks(input.organizationId, task.projectId, {
      wbsNodeId: input.wbsNodeId !== undefined ? input.wbsNodeId : task.wbsNodeId,
      activityId: input.activityId !== undefined ? input.activityId : task.activityId,
    });
  }
  if (input.diaryId) await assertDiary(input.organizationId, task.projectId, input.diaryId);
  if (input.code !== undefined && input.code.trim() !== task.code) {
    await assertCodeFree(
      task.projectId,
      input.code.trim(),
      (where) => prisma.fieldTask.findFirst({ where, select: { id: true } }),
      "de tarefa"
    );
  }

  const data: Record<string, unknown> = {};
  if (input.code !== undefined) data.code = input.code.trim();
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.description !== undefined) data.description = input.description.trim() || null;
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.assigneeId !== undefined) data.assigneeId = input.assigneeId;
  if (input.dueDate !== undefined) data.dueDate = toDate(input.dueDate);
  if (input.wbsNodeId !== undefined) data.wbsNodeId = input.wbsNodeId;
  if (input.activityId !== undefined) data.activityId = input.activityId;
  if (input.diaryId !== undefined) data.diaryId = input.diaryId;

  const updated = await prisma.fieldTask.update({
    where: { id: task.id },
    data: { ...data, updatedBy: input.actorId, version: { increment: 1 } },
  });

  await audit(input, task.projectId, "FieldTask", "UPDATE", {
    objectId: task.id,
    oldValue: { title: task.title, priority: task.priority, dueDate: task.dueDate },
    newValue: { title: updated.title, priority: updated.priority, dueDate: updated.dueDate },
  });

  return updated;
}

export async function deleteTask(input: ActorContext & { taskId: string }) {
  const task = await loadLiveTask(input.organizationId, input.taskId);

  if (task.status !== "OPEN") {
    throw new AppError("FIELD_INVALID_STATE", "Só é possível excluir tarefa aberta.");
  }

  await prisma.fieldTask.update({
    where: { id: task.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId },
  });
  await audit(input, task.projectId, "FieldTask", "DELETE", {
    objectId: task.id,
    oldValue: { code: task.code, title: task.title },
  });
  await emitDomainEvent(input, task.projectId, "FieldTask.Deleted", "FieldTask", task.id, {
    code: task.code,
  });

  return { taskId: task.id };
}

export interface TaskTransitionInput {
  taskId: string;
  action: TaskAction;
  reason?: string;
}

export async function transitionTask(input: ActorContext & TaskTransitionInput) {
  const task = await loadLiveTask(input.organizationId, input.taskId);
  const next = nextTaskStatus(task.status, input.action);

  if (!next) {
    throw new AppError(
      "FIELD_INVALID_STATE",
      `Transição "${input.action}" inválida para o status ${task.status}.`
    );
  }
  if (input.action === "CANCEL" && !input.reason?.trim()) {
    throw new AppError("VALIDATION_ERROR", "Cancelamento exige o motivo.");
  }

  const now = new Date();
  const updated = await prisma.fieldTask.update({
    where: { id: task.id },
    data: {
      status: next,
      ...(input.action === "START" ? { startedAt: task.startedAt ?? now } : {}),
      ...(input.action === "COMPLETE" ? { completedAt: now } : {}),
      ...(input.action === "CANCEL" ? { cancelReason: input.reason!.trim() } : {}),
      ...(input.action === "REOPEN"
        ? { startedAt: null, completedAt: null, cancelReason: null }
        : {}),
      updatedBy: input.actorId,
      version: { increment: 1 },
    },
  });

  await audit(input, task.projectId, "FieldTask", input.action, {
    objectId: task.id,
    oldValue: { status: task.status },
    newValue: { status: next },
    reason: input.reason ?? null,
  });
  await emitDomainEvent(input, task.projectId, `FieldTask.${input.action}`, "FieldTask", task.id, {
    code: task.code,
    status: next,
  });

  return updated;
}
