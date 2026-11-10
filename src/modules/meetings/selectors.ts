import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";

export interface MeetingActionRow {
  id: string;
  code: string;
  description: string;
  ownerId: string | null;
  ownerName: string | null;
  dueDate: string | null;
  status: string;
  wbsNodeId: string | null;
  activityId: string | null;
  requirementId: string | null;
}

export interface MeetingRow {
  id: string;
  code: string;
  title: string;
  meetingDate: string;
  location: string | null;
  attendees: string[];
  minutes: string | null;
  status: string;
  projectId: string | null;
  actionCount: number;
  actions: MeetingActionRow[];
  updatedAt: Date;
}

export async function listMeetings(organizationId: string, projectId?: string): Promise<MeetingRow[]> {
  const rows = await prisma.meeting.findMany({
    where: { organizationId, deletedAt: null, ...(projectId ? { projectId } : {}) },
    include: {
      actions: { where: { deletedAt: null }, orderBy: { code: "asc" } },
      _count: { select: { actions: { where: { deletedAt: null } } } },
    },
    orderBy: { meetingDate: "desc" },
  });
  // owner names
  const ownerIds = [...new Set(rows.flatMap((r) => r.actions.map((a) => a.ownerId).filter(Boolean) as string[]))];
  const owners = ownerIds.length
    ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } })
    : [];
  const ownerMap = new Map(owners.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    meetingDate: r.meetingDate.toISOString().slice(0, 10),
    location: r.location,
    attendees: Array.isArray(r.attendees) ? (r.attendees as string[]) : [],
    minutes: r.minutes,
    status: r.status,
    projectId: r.projectId,
    actionCount: r._count.actions,
    actions: r.actions.map((a) => ({
      id: a.id,
      code: a.code,
      description: a.description,
      ownerId: a.ownerId,
      ownerName: a.ownerId ? ownerMap.get(a.ownerId) ?? null : null,
      dueDate: a.dueDate ? a.dueDate.toISOString().slice(0, 10) : null,
      status: a.status,
      wbsNodeId: a.wbsNodeId,
      activityId: a.activityId,
      requirementId: a.requirementId,
    })),
    updatedAt: r.updatedAt,
  }));
}

export async function getMeeting(organizationId: string, meetingId: string): Promise<MeetingRow> {
  const r = await prisma.meeting.findFirst({
    where: { id: meetingId, organizationId, deletedAt: null },
    include: {
      actions: { where: { deletedAt: null }, orderBy: { code: "asc" } },
      _count: { select: { actions: { where: { deletedAt: null } } } },
    },
  });
  if (!r) throw new AppError("NOT_FOUND", "Reunião não encontrada.");
  const ownerIds = [...new Set(r.actions.map((a) => a.ownerId).filter(Boolean) as string[])];
  const owners = ownerIds.length
    ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } })
    : [];
  const ownerMap = new Map(owners.map((u) => [u.id, u.name]));
  return {
    id: r.id,
    code: r.code,
    title: r.title,
    meetingDate: r.meetingDate.toISOString().slice(0, 10),
    location: r.location,
    attendees: Array.isArray(r.attendees) ? (r.attendees as string[]) : [],
    minutes: r.minutes,
    status: r.status,
    projectId: r.projectId,
    actionCount: r._count.actions,
    actions: r.actions.map((a) => ({
      id: a.id,
      code: a.code,
      description: a.description,
      ownerId: a.ownerId,
      ownerName: a.ownerId ? ownerMap.get(a.ownerId) ?? null : null,
      dueDate: a.dueDate ? a.dueDate.toISOString().slice(0, 10) : null,
      status: a.status,
      wbsNodeId: a.wbsNodeId,
      activityId: a.activityId,
      requirementId: a.requirementId,
    })),
    updatedAt: r.updatedAt,
  };
}