import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import {
  nextDiaryStatus,
  type DiaryAction,
} from "@/modules/field/engine";
import {
  assertCodeFree,
  audit,
  emitDomainEvent,
  nextFieldCode,
  toDate,
  type ActorContext,
} from "@/modules/field/common";
import { assertFieldProject } from "@/modules/field/selectors";

// Diário de obra (E12-US01, §26): um registro por dia de obra no projeto
// (índice único projectId+entryDate). Workflow DRAFT → SUBMITTED →
// APPROVED/REJECTED; aprovado/cancelado são histórico imutável (FIELD:APPROVE
// aprova — SITE_COORDINATOR não tem essa permissão).

export interface CreateDiaryInput {
  projectId: string;
  code?: string;
  entryDate: string;
  team?: string;
  workHours?: number;
  activities?: string;
  progressNotes?: string;
  equipment?: string;
  materials?: string;
  occurrences?: string;
  constraintNotes?: string;
  conditions?: string;
  inspections?: string;
  safety?: string;
  visitors?: string;
  decisions?: string;
  water?: number;
  energy?: number;
  wasteNotes?: string;
}

async function loadLiveDiary(organizationId: string, diaryId: string) {
  const diary = await prisma.fieldDiary.findFirst({
    where: { id: diaryId, organizationId, deletedAt: null },
  });
  if (!diary) {
    throw new AppError("NOT_FOUND", "Diário não encontrado nesta organização.");
  }
  return diary;
}

export async function createDiary(input: ActorContext & CreateDiaryInput) {
  await assertFieldProject(input.organizationId, input.projectId);

  let code = input.code?.trim();
  if (code) {
    await assertCodeFree(
      input.projectId,
      code,
      (where) => prisma.fieldDiary.findFirst({ where, select: { id: true } }),
      "de diário"
    );
  } else {
    code = await nextFieldCode(input.projectId, "FD");
  }

  const entryDate = toDate(input.entryDate)!;
  const sameDay = await prisma.fieldDiary.findFirst({
    where: { projectId: input.projectId, entryDate, deletedAt: null },
    select: { code: true },
  });
  if (sameDay) {
    throw new AppError(
      "CONFLICT",
      `Já existe diário para ${input.entryDate} neste projeto (${sameDay.code}).`
    );
  }

  const diary = await prisma.fieldDiary.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      code,
      entryDate,
      team: input.team?.trim() || null,
      workHours: input.workHours ?? null,
      activities: input.activities?.trim() || null,
      progressNotes: input.progressNotes?.trim() || null,
      equipment: input.equipment?.trim() || null,
      materials: input.materials?.trim() || null,
      occurrences: input.occurrences?.trim() || null,
      constraintNotes: input.constraintNotes?.trim() || null,
      conditions: input.conditions?.trim() || null,
      inspections: input.inspections?.trim() || null,
      safety: input.safety?.trim() || null,
      visitors: input.visitors?.trim() || null,
      decisions: input.decisions?.trim() || null,
      water: input.water ?? null,
      energy: input.energy ?? null,
      wasteNotes: input.wasteNotes?.trim() || null,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });

  await audit(input, input.projectId, "FieldDiary", "CREATE", {
    objectId: diary.id,
    newValue: { code: diary.code, entryDate: input.entryDate },
  });
  await emitDomainEvent(input, input.projectId, "FieldDiary.Created", "FieldDiary", diary.id, {
    code: diary.code,
    entryDate: input.entryDate,
  });

  return diary;
}

export interface UpdateDiaryInput extends Partial<Omit<CreateDiaryInput, "projectId" | "code">> {
  diaryId: string;
}

export async function updateDiary(input: ActorContext & UpdateDiaryInput) {
  const diary = await loadLiveDiary(input.organizationId, input.diaryId);

  if (diary.status !== "DRAFT" && diary.status !== "REJECTED") {
    throw new AppError(
      "FIELD_INVALID_STATE",
      `Diário ${diary.status === "APPROVED" ? "aprovado" : diary.status === "CANCELLED" ? "cancelado" : "enviado"} não é editável — reabra ou revise.`
    );
  }

  const data: Record<string, unknown> = {};
  if (input.entryDate !== undefined && toDate(input.entryDate)!.getTime() !== diary.entryDate.getTime()) {
    const sameDay = await prisma.fieldDiary.findFirst({
      where: { projectId: diary.projectId, entryDate: toDate(input.entryDate)!, deletedAt: null },
      select: { code: true },
    });
    if (sameDay && sameDay.code !== diary.code) {
      throw new AppError(
        "CONFLICT",
        `Já existe diário para ${input.entryDate} neste projeto (${sameDay.code}).`
      );
    }
    data.entryDate = toDate(input.entryDate);
  }
  const textFields = [
    "team",
    "activities",
    "progressNotes",
    "equipment",
    "materials",
    "occurrences",
    "constraintNotes",
    "conditions",
    "inspections",
    "safety",
    "visitors",
    "decisions",
    "wasteNotes",
  ] as const;
  for (const field of textFields) {
    const value = input[field];
    if (value !== undefined) data[field] = value.trim() || null;
  }
  if (input.workHours !== undefined) data.workHours = input.workHours;
  if (input.water !== undefined) data.water = input.water;
  if (input.energy !== undefined) data.energy = input.energy;

  const updated = await prisma.fieldDiary.update({
    where: { id: diary.id },
    data: { ...data, updatedBy: input.actorId, version: { increment: 1 } },
  });

  await audit(input, diary.projectId, "FieldDiary", "UPDATE", {
    objectId: diary.id,
    oldValue: { team: diary.team, workHours: diary.workHours },
    newValue: { team: updated.team, workHours: updated.workHours },
  });

  return updated;
}

export async function deleteDiary(input: ActorContext & { diaryId: string }) {
  const diary = await loadLiveDiary(input.organizationId, input.diaryId);

  if (diary.status !== "DRAFT" && diary.status !== "REJECTED") {
    throw new AppError(
      "FIELD_INVALID_STATE",
      "Só é possível excluir diário em rascunho ou rejeitado."
    );
  }

  await prisma.fieldDiary.update({
    where: { id: diary.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId },
  });
  await audit(input, diary.projectId, "FieldDiary", "DELETE", {
    objectId: diary.id,
    oldValue: { code: diary.code, entryDate: diary.entryDate },
  });
  await emitDomainEvent(input, diary.projectId, "FieldDiary.Deleted", "FieldDiary", diary.id, {
    code: diary.code,
  });

  return { diaryId: diary.id };
}

export interface DiaryTransitionInput {
  diaryId: string;
  action: DiaryAction;
  reason?: string;
}

export async function transitionDiary(input: ActorContext & DiaryTransitionInput) {
  const diary = await loadLiveDiary(input.organizationId, input.diaryId);
  const next = nextDiaryStatus(diary.status, input.action);

  if (!next) {
    throw new AppError(
      "FIELD_INVALID_STATE",
      `Transição "${input.action}" inválida para o status ${diary.status}.`
    );
  }
  if (input.action === "REJECT" && !input.reason?.trim()) {
    throw new AppError("VALIDATION_ERROR", "Rejeição exige o motivo (campo obrigatório).");
  }
  if (input.action === "CANCEL" && !input.reason?.trim()) {
    throw new AppError("VALIDATION_ERROR", "Cancelamento exige o motivo.");
  }

  const now = new Date();
  const updated = await prisma.fieldDiary.update({
    where: { id: diary.id },
    data: {
      status: next,
      ...(input.action === "SUBMIT" ? { submittedAt: now, submittedBy: input.actorId } : {}),
      ...(input.action === "APPROVE" ? { approvedAt: now, approvedBy: input.actorId } : {}),
      ...(input.action === "REJECT" ? { rejectReason: input.reason!.trim() } : {}),
      ...(input.action === "REVISE" ? { rejectReason: null } : {}),
      ...(input.action === "CANCEL" ? { cancelReason: input.reason!.trim() } : {}),
      ...(input.action === "REOPEN"
        ? { cancelReason: null, approvedAt: null, approvedBy: null }
        : {}),
      updatedBy: input.actorId,
      version: { increment: 1 },
    },
  });

  await audit(input, diary.projectId, "FieldDiary", input.action, {
    objectId: diary.id,
    oldValue: { status: diary.status },
    newValue: { status: next },
    reason: input.reason ?? null,
  });
  await emitDomainEvent(
    input,
    diary.projectId,
    `FieldDiary.${input.action}`,
    "FieldDiary",
    diary.id,
    { code: diary.code, status: next }
  );

  return updated;
}
