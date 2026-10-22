import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import {
  appliedActivityProgress,
  isValidMeasurement,
  progressLevelFor,
} from "@/modules/field/engine";
import {
  assertCodeFree,
  assertFieldLinks,
  audit,
  emitDomainEvent,
  findByIdempotentKey,
  nextFieldCode,
  toDate,
  type ActorContext,
} from "@/modules/field/common";
import { assertFieldProject } from "@/modules/field/selectors";
import { updateActivityProgress } from "@/modules/schedule/activities";

// Medição de avanço físico (E12-US04, §12, BR-006): registro explícito com
// método, percentual, quantidade física real e CRITÉRIO obrigatório. O
// percentual financeiro nunca alimenta este registro (BR-006); ao medir uma
// atividade, o `physicalProgress` dela só muda aqui — auditado em PROGRESS.

export interface CreateProgressInput {
  projectId: string;
  code?: string;
  measurementDate: string;
  wbsNodeId?: string | null;
  activityId?: string | null;
  method?: "PERCENT_COMPLETE" | "PHYSICAL" | "UNITS";
  progressPercent: number;
  quantityPlanned?: number;
  quantityReal?: number;
  unit?: string;
  criterion: string;
  notes?: string;
  clientUuid?: string;
}

export interface UpdateProgressInput extends Partial<Omit<CreateProgressInput, "projectId">> {
  progressId: string;
}

async function loadLiveMeasurement(organizationId: string, progressId: string) {
  const measurement = await prisma.progressMeasurement.findFirst({
    where: { id: progressId, organizationId, deletedAt: null },
  });
  if (!measurement) {
    throw new AppError("NOT_FOUND", "Medição não encontrada nesta organização.");
  }
  return measurement;
}

// BR-006: a medição é a ÚNICA fonte do avanço físico da atividade — sincroniza
// o physicalProgress (audit de PROGRESS + recálculo de forecast no módulo).
async function syncActivityProgress(input: ActorContext, measurement: {
  projectId: string;
  activityId: string | null;
  progressPercent: number;
}) {
  if (!measurement.activityId) return;
  const activity = await prisma.scheduleActivity.findFirst({
    where: { id: measurement.activityId, organizationId: input.organizationId, deletedAt: null },
    select: { status: true, physicalProgress: true },
  });
  if (!activity) return;

  const target = appliedActivityProgress(activity.status, measurement.progressPercent);
  if (target === activity.physicalProgress) return;

  await updateActivityProgress({
    organizationId: input.organizationId,
    actorId: input.actorId,
    actorLabel: input.actorLabel,
    correlationId: input.correlationId,
    ipAddress: input.ipAddress,
    activityId: measurement.activityId,
    physicalProgress: target,
  });
}

// BR-006: percentual 0–100 com critério de verificação explícito.
function assertMeasurement(input: { progressPercent?: number; criterion?: string }) {
  if (input.progressPercent === undefined && input.criterion === undefined) return;
  const valid = isValidMeasurement({
    progressPercent: input.progressPercent ?? 0,
    criterion: input.criterion ?? "",
  });
  if (!valid) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Medição inválida: percentual entre 0 e 100 e critério de verificação obrigatórios (BR-006)."
    );
  }
}

export async function createProgress(input: ActorContext & CreateProgressInput) {
  await assertFieldProject(input.organizationId, input.projectId);
  assertMeasurement(input);

  // Idempotência offline (§38): reenvio do mesmo UUID devolve o original.
  const replay = await findByIdempotentKey(input.projectId, input.clientUuid, (where) =>
    prisma.progressMeasurement.findFirst({ where, select: { id: true } })
  );
  if (replay) {
    return prisma.progressMeasurement.findFirstOrThrow({ where: { id: replay.id } });
  }

  await assertFieldLinks(input.organizationId, input.projectId, {
    wbsNodeId: input.wbsNodeId,
    activityId: input.activityId,
  });

  let code = input.code?.trim();
  if (code) {
    await assertCodeFree(
      input.projectId,
      code,
      (where) => prisma.progressMeasurement.findFirst({ where, select: { id: true } }),
      "de medição"
    );
  } else {
    code = await nextFieldCode(input.projectId, "PM");
  }

  const measurement = await prisma.progressMeasurement.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      code,
      measurementDate: toDate(input.measurementDate)!,
      level: progressLevelFor(input),
      wbsNodeId: input.wbsNodeId ?? null,
      activityId: input.activityId ?? null,
      method: input.method ?? "PHYSICAL",
      progressPercent: input.progressPercent,
      quantityPlanned: input.quantityPlanned ?? null,
      quantityReal: input.quantityReal ?? null,
      unit: input.unit?.trim() || null,
      criterion: input.criterion.trim(),
      notes: input.notes?.trim() || null,
      clientUuid: input.clientUuid ?? null,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });

  await syncActivityProgress(input, measurement);

  await audit(input, input.projectId, "ProgressMeasurement", "CREATE", {
    objectId: measurement.id,
    newValue: {
      code: measurement.code,
      level: measurement.level,
      progressPercent: measurement.progressPercent,
      criterion: measurement.criterion,
      activityId: measurement.activityId,
    },
  });
  await emitDomainEvent(
    input,
    input.projectId,
    "Progress.Recorded",
    "ProgressMeasurement",
    measurement.id,
    { code: measurement.code, level: measurement.level, progressPercent: measurement.progressPercent }
  );

  return measurement;
}

export async function updateProgress(input: ActorContext & UpdateProgressInput) {
  const measurement = await loadLiveMeasurement(input.organizationId, input.progressId);
  assertMeasurement({
    progressPercent: input.progressPercent ?? measurement.progressPercent,
    criterion: input.criterion ?? measurement.criterion,
  });

  if (input.activityId !== undefined || input.wbsNodeId !== undefined) {
    await assertFieldLinks(input.organizationId, measurement.projectId, {
      wbsNodeId: input.wbsNodeId ?? null,
      activityId: input.activityId ?? null,
    });
  }
  if (input.code !== undefined && input.code.trim() && input.code.trim() !== measurement.code) {
    await assertCodeFree(
      measurement.projectId,
      input.code.trim(),
      (where) =>
        prisma.progressMeasurement.findFirst({
          where: { ...where, id: { not: measurement.id } },
          select: { id: true },
        }),
      "de medição"
    );
  }

  const data: Record<string, unknown> = {};
  if (input.code !== undefined && input.code.trim()) data.code = input.code.trim();
  if (input.measurementDate !== undefined) data.measurementDate = toDate(input.measurementDate);
  if (input.wbsNodeId !== undefined) data.wbsNodeId = input.wbsNodeId;
  if (input.activityId !== undefined) data.activityId = input.activityId;
  if (input.method !== undefined) data.method = input.method;
  if (input.progressPercent !== undefined) data.progressPercent = input.progressPercent;
  if (input.quantityPlanned !== undefined) data.quantityPlanned = input.quantityPlanned;
  if (input.quantityReal !== undefined) data.quantityReal = input.quantityReal;
  if (input.unit !== undefined) data.unit = input.unit?.trim() || null;
  if (input.criterion !== undefined) data.criterion = input.criterion.trim();
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;
  data.updatedBy = input.actorId;
  data.version = { increment: 1 };

  const updated = await prisma.progressMeasurement.update({
    where: { id: measurement.id },
    data,
  });

  await syncActivityProgress(input, updated);

  await audit(input, measurement.projectId, "ProgressMeasurement", "UPDATE", {
    objectId: measurement.id,
    oldValue: {
      progressPercent: measurement.progressPercent,
      criterion: measurement.criterion,
      activityId: measurement.activityId,
    },
    newValue: {
      progressPercent: updated.progressPercent,
      criterion: updated.criterion,
      activityId: updated.activityId,
    },
  });

  return updated;
}

export async function deleteProgress(input: ActorContext & { progressId: string }) {
  const measurement = await loadLiveMeasurement(input.organizationId, input.progressId);

  await prisma.progressMeasurement.update({
    where: { id: measurement.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId },
  });
  await audit(input, measurement.projectId, "ProgressMeasurement", "DELETE", {
    objectId: measurement.id,
    oldValue: { code: measurement.code, progressPercent: measurement.progressPercent },
  });
  await emitDomainEvent(
    input,
    measurement.projectId,
    "Progress.Deleted",
    "ProgressMeasurement",
    measurement.id,
    { code: measurement.code }
  );

  // A exclusão não retroage o physicalProgress da atividade — o histórico
  // de medições é a fonte; o próximo registro corrige o percentual.
  return { progressId: measurement.id };
}
