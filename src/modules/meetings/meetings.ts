import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { nextMeetingStatus } from "@/modules/meetings/engine";

interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

async function nextMeetingCode(organizationId: string, projectId: string | null): Promise<string> {
  const rows = await prisma.meeting.findMany({
    where: { organizationId, projectId: projectId ?? null },
    select: { code: true },
  });
  let max = 0;
  for (const { code } of rows) {
    const m = /^MT(\d+)$/.exec(code);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `MT${String(max + 1).padStart(3, "0")}`;
}

async function nextActionCode(meetingId: string): Promise<string> {
  const rows = await prisma.meetingAction.findMany({ where: { meetingId }, select: { code: true } });
  let max = 0;
  for (const { code } of rows) {
    const m = /^AC(\d+)$/.exec(code);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `AC${String(max + 1).padStart(3, "0")}`;
}

export async function createMeeting(
  input: ActorContext & {
    projectId?: string | null;
    title: string;
    meetingDate: string;
    ownerId?: string | null;
    location?: string | null;
    attendees?: string[];
    minutes?: string | null;
    participantIds?: string[];
  }
) {
  const code = await nextMeetingCode(input.organizationId, input.projectId ?? null);
  const meeting = await prisma.meeting.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      code,
      title: input.title.trim(),
      meetingDate: new Date(`${input.meetingDate}T00:00:00.000Z`),
      ownerId: input.ownerId ?? null,
      location: input.location?.trim() || null,
      attendees: input.attendees ?? [],
      minutes: input.minutes?.trim() || null,
      createdBy: input.actorId,
      updatedBy: input.actorId,
      ...(input.participantIds && input.participantIds.length
        ? { participants: { create: input.participantIds.map((uid) => ({ organizationId: input.organizationId, userId: uid, createdBy: input.actorId })) } }
        : {}),
    },
  });
  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      projectId: input.projectId ?? null,
      objectType: "Meeting",
      objectId: meeting.id,
      action: "CREATE",
      newValue: { code: meeting.code, title: meeting.title },
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });
  return meeting;
}

export async function updateMeeting(
  input: ActorContext & { meetingId: string } & {
    title?: string;
    meetingDate?: string;
    ownerId?: string | null;
    location?: string | null;
    attendees?: string[];
    minutes?: string | null;
  }
) {
  const meeting = await prisma.meeting.findFirst({
    where: { id: input.meetingId, organizationId: input.organizationId, deletedAt: null },
  });
  if (!meeting) throw new AppError("NOT_FOUND", "Reunião não encontrada.");
  if (meeting.status !== "DRAFT") throw new AppError("VALIDATION_ERROR", "Apenas atas em rascunho podem ser editadas.");

  const updated = await prisma.meeting.update({
    where: { id: meeting.id },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.meetingDate !== undefined ? { meetingDate: new Date(`${input.meetingDate}T00:00:00.000Z`) } : {}),
      ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
      ...(input.location !== undefined ? { location: input.location?.trim() || null } : {}),
      ...(input.attendees !== undefined ? { attendees: input.attendees } : {}),
      ...(input.minutes !== undefined ? { minutes: input.minutes?.trim() || null } : {}),
      updatedBy: input.actorId,
      version: { increment: 1 },
    },
  });
  return updated;
}

export async function deleteMeeting(input: ActorContext & { meetingId: string }) {
  const meeting = await prisma.meeting.findFirst({
    where: { id: input.meetingId, organizationId: input.organizationId, deletedAt: null },
  });
  if (!meeting) throw new AppError("NOT_FOUND", "Reunião não encontrada.");
  await prisma.meeting.update({
    where: { id: meeting.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId },
  });
  return { meetingId: meeting.id };
}

export async function transitionMeeting(input: ActorContext & { meetingId: string; action: "SUBMIT" | "APPROVE" | "CANCEL" | "REOPEN" }) {
  const meeting = await prisma.meeting.findFirst({
    where: { id: input.meetingId, organizationId: input.organizationId, deletedAt: null },
  });
  if (!meeting) throw new AppError("NOT_FOUND", "Reunião não encontrada.");
  const result = nextMeetingStatus({ currentStatus: meeting.status as any, action: input.action });
  if ("error" in result) throw new AppError("VALIDATION_ERROR", result.error);
  const updated = await prisma.meeting.update({
    where: { id: meeting.id },
    data: { status: result.nextStatus, updatedBy: input.actorId, version: { increment: 1 } },
  });
  return updated;
}

export async function addMeetingAction(
  input: ActorContext & {
    meetingId: string;
    description: string;
    ownerId?: string | null;
    dueDate?: string | null;
    wbsNodeId?: string | null;
    activityId?: string | null;
    requirementId?: string | null;
  }
) {
  const meeting = await prisma.meeting.findFirst({
    where: { id: input.meetingId, organizationId: input.organizationId, deletedAt: null },
  });
  if (!meeting) throw new AppError("NOT_FOUND", "Reunião não encontrada.");
  const code = await nextActionCode(meeting.id);
  const action = await prisma.meetingAction.create({
    data: {
      organizationId: input.organizationId,
      meetingId: meeting.id,
      code,
      description: input.description.trim(),
      ownerId: input.ownerId ?? null,
      dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00.000Z`) : null,
      wbsNodeId: input.wbsNodeId ?? null,
      activityId: input.activityId ?? null,
      requirementId: input.requirementId ?? null,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });
  return action;
}

export async function addMeetingParticipant(input: ActorContext & { meetingId: string; userId: string }) {
  const meeting = await prisma.meeting.findFirst({ where: { id: input.meetingId, organizationId: input.organizationId, deletedAt: null } });
  if (!meeting) throw new AppError("NOT_FOUND", "Reunião não encontrada.");
  const existing = await prisma.meetingParticipant.findUnique({ where: { meetingId_userId: { meetingId: meeting.id, userId: input.userId } } });
  if (existing) return existing;
  const p = await prisma.meetingParticipant.create({
    data: { organizationId: input.organizationId, meetingId: meeting.id, userId: input.userId, createdBy: input.actorId },
  });
  return p;
}

export async function removeMeetingParticipant(input: ActorContext & { meetingId: string; userId: string }) {
  const meeting = await prisma.meeting.findFirst({ where: { id: input.meetingId, organizationId: input.organizationId, deletedAt: null } });
  if (!meeting) throw new AppError("NOT_FOUND", "Reunião não encontrada.");
  await prisma.meetingParticipant.deleteMany({ where: { meetingId: meeting.id, userId: input.userId } });
  return { meetingId: meeting.id, userId: input.userId };
}

export async function signMeeting(input: ActorContext & { meetingId: string }) {
  const meeting = await prisma.meeting.findFirst({ where: { id: input.meetingId, organizationId: input.organizationId, deletedAt: null } });
  if (!meeting) throw new AppError("NOT_FOUND", "Reunião não encontrada.");
  const participant = await prisma.meetingParticipant.findUnique({ where: { meetingId_userId: { meetingId: meeting.id, userId: input.actorId } } });
  if (!participant) throw new AppError("FORBIDDEN", "Você não é participante desta reunião.");
  if (participant.status === "SIGNED") return participant;
  const updated = await prisma.meetingParticipant.update({
    where: { id: participant.id },
    data: { status: "SIGNED", signedAt: new Date() },
  });
  return updated;
}