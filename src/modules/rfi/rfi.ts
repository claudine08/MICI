import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { nextRfiStatus, type RfiStatus } from "@/modules/rfi/engine";

interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

async function nextRfiCode(projectId: string): Promise<string> {
  const rows = await prisma.rfi.findMany({ where: { projectId }, select: { code: true } });
  let max = 0;
  for (const { code } of rows) {
    const m = /^RFI(\d+)$/.exec(code);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `RFI${String(max + 1).padStart(3, "0")}`;
}

export async function createRfi(
  input: ActorContext & {
    projectId: string;
    title: string;
    subjectGroup?: string | null;
    question: string;
    recipientId?: string | null;
    dueDate?: string | null;
    wbsNodeId?: string | null;
    activityId?: string | null;
    requirementId?: string | null;
  }
) {
  const code = await nextRfiCode(input.projectId);
  const rfi = await prisma.rfi.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      code,
      title: input.title.trim(),
      subjectGroup: input.subjectGroup?.trim() || null,
      question: input.question.trim(),
      recipientId: input.recipientId ?? null,
      dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00.000Z`) : null,
      wbsNodeId: input.wbsNodeId ?? null,
      activityId: input.activityId ?? null,
      requirementId: input.requirementId ?? null,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });
  return rfi;
}

export async function updateRfi(
  input: ActorContext & { rfiId: string } & {
    title?: string;
    subjectGroup?: string | null;
    question?: string;
    recipientId?: string | null;
    dueDate?: string | null;
    wbsNodeId?: string | null;
    activityId?: string | null;
    requirementId?: string | null;
  }
) {
  const rfi = await prisma.rfi.findFirst({ where: { id: input.rfiId, organizationId: input.organizationId, deletedAt: null } });
  if (!rfi) throw new AppError("NOT_FOUND", "RFI não encontrado.");
  if (rfi.status !== "OPEN") throw new AppError("VALIDATION_ERROR", "Apenas RFIs abertos podem ser editados.");
  const updated = await prisma.rfi.update({
    where: { id: rfi.id },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.subjectGroup !== undefined ? { subjectGroup: input.subjectGroup?.trim() || null } : {}),
      ...(input.question !== undefined ? { question: input.question.trim() } : {}),
      ...(input.recipientId !== undefined ? { recipientId: input.recipientId } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00.000Z`) : null } : {}),
      ...(input.wbsNodeId !== undefined ? { wbsNodeId: input.wbsNodeId } : {}),
      ...(input.activityId !== undefined ? { activityId: input.activityId } : {}),
      ...(input.requirementId !== undefined ? { requirementId: input.requirementId } : {}),
      updatedBy: input.actorId,
    },
  });
  return updated;
}

export async function deleteRfi(input: ActorContext & { rfiId: string }) {
  const rfi = await prisma.rfi.findFirst({ where: { id: input.rfiId, organizationId: input.organizationId, deletedAt: null } });
  if (!rfi) throw new AppError("NOT_FOUND", "RFI não encontrado.");
  await prisma.rfi.update({ where: { id: rfi.id }, data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId } });
  return { rfiId: rfi.id };
}

export async function answerRfi(input: ActorContext & { rfiId: string; response: string }) {
  const rfi = await prisma.rfi.findFirst({ where: { id: input.rfiId, organizationId: input.organizationId, deletedAt: null } });
  if (!rfi) throw new AppError("NOT_FOUND", "RFI não encontrado.");
  const result = nextRfiStatus({ currentStatus: rfi.status as RfiStatus, action: "ANSWER", hasResponse: !!input.response.trim() });
  if ("error" in result) throw new AppError("VALIDATION_ERROR", result.error);
  const updated = await prisma.rfi.update({
    where: { id: rfi.id },
    data: { status: result.nextStatus, response: input.response.trim(), respondedBy: input.actorId, respondedAt: new Date(), updatedBy: input.actorId },
  });
  return updated;
}

export async function transitionRfi(input: ActorContext & { rfiId: string; action: "ANSWER" | "CLOSE" | "CANCEL" | "REOPEN" }) {
  const rfi = await prisma.rfi.findFirst({ where: { id: input.rfiId, organizationId: input.organizationId, deletedAt: null } });
  if (!rfi) throw new AppError("NOT_FOUND", "RFI não encontrado.");
  const result = nextRfiStatus({ currentStatus: rfi.status as RfiStatus, action: input.action, hasResponse: !!rfi.response });
  if ("error" in result) throw new AppError("VALIDATION_ERROR", result.error);
  const updated = await prisma.rfi.update({
    where: { id: rfi.id },
    data: { status: result.nextStatus, updatedBy: input.actorId },
  });
  return updated;
}