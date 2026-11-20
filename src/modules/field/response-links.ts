import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { randomBytes } from "crypto";
import { updateDiary } from "@/modules/field/diaries";
import { updateTask } from "@/modules/field/tasks";
import { updateConstraint } from "@/modules/field/constraints";

export interface ResponseLink {
  token: string;
  organizationId: string;
  projectId: string;
  entityType: string;
  entityId: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdBy: string | null;
}

export async function createResponseLink(input: {
  organizationId: string;
  projectId: string;
  entityType: "diary" | "task" | "constraint";
  entityId: string;
  createdBy: string;
}): Promise<string> {
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.fieldResponseToken.create({
    data: {
      token,
      organizationId: input.organizationId,
      projectId: input.projectId,
      entityType: input.entityType,
      entityId: input.entityId,
      expiresAt,
      createdBy: input.createdBy,
    },
  });
  return token;
}

export async function getResponseLink(token: string): Promise<ResponseLink> {
  const row = await prisma.fieldResponseToken.findUnique({ where: { token } });
  if (!row) throw new AppError("NOT_FOUND", "Link inválido ou expirado.");
  if (row.expiresAt < new Date()) throw new AppError("FORBIDDEN", "Link expirado.");
  return row;
}

export async function submitDiaryResponse(token: string, payload: Record<string, unknown>) {
  const link = await getResponseLink(token);
  if (link.entityType !== "diary") throw new AppError("VALIDATION_ERROR", "Tipo inválido.");
  if (link.usedAt) throw new AppError("FORBIDDEN", "Link já utilizado.");
  const diary = await prisma.fieldDiary.findFirst({ where: { id: link.entityId, organizationId: link.organizationId, deletedAt: null } });
  if (!diary) throw new AppError("NOT_FOUND", "Diário não encontrado.");
  await updateDiary({
    organizationId: link.organizationId,
    actorId: link.createdBy ?? "whatsapp",
    actorLabel: "WhatsApp",
    diaryId: link.entityId,
    ...payload,
  } as any);
  await prisma.fieldResponseToken.update({ where: { token }, data: { usedAt: new Date() } });
}

export async function submitTaskResponse(token: string, payload: Record<string, unknown>) {
  const link = await getResponseLink(token);
  if (link.entityType !== "task") throw new AppError("VALIDATION_ERROR", "Tipo inválido.");
  if (link.usedAt) throw new AppError("FORBIDDEN", "Link já utilizado.");
  const task = await prisma.fieldTask.findFirst({ where: { id: link.entityId, organizationId: link.organizationId, deletedAt: null } });
  if (!task) throw new AppError("NOT_FOUND", "Tarefa não encontrada.");
  await updateTask({
    organizationId: link.organizationId,
    actorId: link.createdBy ?? "whatsapp",
    actorLabel: "WhatsApp",
    taskId: link.entityId,
    ...payload,
  } as any);
  await prisma.fieldResponseToken.update({ where: { token }, data: { usedAt: new Date() } });
}

export async function submitConstraintResponse(token: string, payload: Record<string, unknown>) {
  const link = await getResponseLink(token);
  if (link.entityType !== "constraint") throw new AppError("VALIDATION_ERROR", "Tipo inválido.");
  if (link.usedAt) throw new AppError("FORBIDDEN", "Link já utilizado.");
  const constraint = await prisma.constraint.findFirst({ where: { id: link.entityId, organizationId: link.organizationId, deletedAt: null } });
  if (!constraint) throw new AppError("NOT_FOUND", "Restrição não encontrada.");
  await updateConstraint({
    organizationId: link.organizationId,
    actorId: link.createdBy ?? "whatsapp",
    actorLabel: "WhatsApp",
    constraintId: link.entityId,
    ...payload,
  } as any);
  await prisma.fieldResponseToken.update({ where: { token }, data: { usedAt: new Date() } });
}