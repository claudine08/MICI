import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { computeCpm } from "@/modules/schedule/engine";
import { recalculateSchedule } from "@/modules/schedule/cpm";
import { assertScheduleProject } from "@/modules/schedule/selectors";

// Dependências do cronograma (E07-US02, §27): FS/SS/FF/SF com lag/lead.
// Ciclo é rejeitado na criação — o grafo precisa permanecer acíclico para o
// CPM ser recalculável a qualquer momento.

interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

function audit(
  input: ActorContext,
  projectId: string,
  action: string,
  data: { oldValue?: unknown; newValue?: unknown; objectId?: string | null }
) {
  return prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      projectId,
      objectType: "ScheduleDependency",
      objectId: data.objectId ?? null,
      action,
      ...(data.oldValue !== undefined ? { oldValue: data.oldValue as never } : {}),
      ...(data.newValue !== undefined ? { newValue: data.newValue as never } : {}),
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });
}

async function loadProjectActivities(organizationId: string, projectId: string) {
  const activities = await prisma.scheduleActivity.findMany({
    where: { organizationId, projectId, deletedAt: null },
    select: { id: true, code: true, duration: true, calendarId: true },
  });
  return activities;
}

export interface CreateDependencyInput {
  projectId: string;
  predecessorId: string;
  successorId: string;
  type?: "FS" | "SS" | "FF" | "SF";
  lag?: number;
}

export async function createDependency(input: ActorContext & CreateDependencyInput) {
  await assertScheduleProject(input.organizationId, input.projectId);
  const activities = await loadProjectActivities(input.organizationId, input.projectId);
  const byId = new Map(activities.map((activity) => [activity.id, activity]));

  if (!byId.has(input.predecessorId)) {
    throw new AppError("VALIDATION_ERROR", "Predecessora inválida para este projeto.");
  }
  if (!byId.has(input.successorId)) {
    throw new AppError("VALIDATION_ERROR", "Sucessora inválida para este projeto.");
  }
  if (input.predecessorId === input.successorId) {
    throw new AppError("VALIDATION_ERROR", "Uma atividade não pode depender de si mesma.");
  }

  const duplicate = await prisma.scheduleDependency.findFirst({
    where: { predecessorId: input.predecessorId, successorId: input.successorId },
    select: { id: true },
  });
  if (duplicate) {
    throw new AppError("CONFLICT", "Essa dependência já existe.");
  }

  const type = input.type ?? "FS";
  const lag = input.lag ?? 0;

  // Ciclo: roda o motor com a nova aresta — ele rejeita grafos cíclicos.
  const existing = await prisma.scheduleDependency.findMany({
    where: { organizationId: input.organizationId, projectId: input.projectId },
    select: { predecessorId: true, successorId: true, type: true, lag: true },
  });
  try {
    computeCpm(
      activities.map((activity) => ({
        id: activity.id,
        code: activity.code,
        duration: activity.duration,
        calendarKey: activity.calendarId,
      })),
      [...existing, { predecessorId: input.predecessorId, successorId: input.successorId, type, lag }],
      { projectStart: 0 }
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "VALIDATION_ERROR") {
      throw new AppError("VALIDATION_ERROR", "Dependência inválida: ciclo no cronograma.", {
        details: error.details,
      });
    }
    throw error;
  }

  const dependency = await prisma.scheduleDependency.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      predecessorId: input.predecessorId,
      successorId: input.successorId,
      type,
      lag,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });

  await audit(input, input.projectId, "CREATE", {
    objectId: dependency.id,
    newValue: {
      predecessor: byId.get(input.predecessorId)!.code,
      successor: byId.get(input.successorId)!.code,
      type,
      lag,
    },
  });

  await recalculateSchedule(input.organizationId, input.projectId);
  return dependency;
}

export async function deleteDependency(input: ActorContext & { dependencyId: string }) {
  const dependency = await prisma.scheduleDependency.findFirst({
    where: { id: input.dependencyId, organizationId: input.organizationId },
  });
  if (!dependency) {
    throw new AppError("NOT_FOUND", "Dependência não encontrada nesta organização.");
  }

  await prisma.scheduleDependency.delete({ where: { id: dependency.id } });

  await audit(input, dependency.projectId, "DELETE", {
    objectId: dependency.id,
    oldValue: {
      predecessorId: dependency.predecessorId,
      successorId: dependency.successorId,
      type: dependency.type,
      lag: dependency.lag,
    },
  });

  await recalculateSchedule(input.organizationId, dependency.projectId);
  return { dependencyId: dependency.id };
}
