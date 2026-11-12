import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";

export interface RfiRow {
  id: string;
  code: string;
  title: string;
  subjectGroup: string | null;
  question: string;
  recipientId: string | null;
  recipientName: string | null;
  dueDate: string | null;
  status: string;
  response: string | null;
  respondedBy: string | null;
  respondedByName: string | null;
  respondedAt: string | null;
  projectId: string;
  wbsNodeId: string | null;
  activityId: string | null;
  requirementId: string | null;
  updatedAt: Date;
}

export async function listRfis(organizationId: string, projectId?: string): Promise<RfiRow[]> {
  const rows = await prisma.rfi.findMany({
    where: { organizationId, deletedAt: null, ...(projectId ? { projectId } : {}) },
    orderBy: { createdAt: "desc" },
  });
  const userIds = [...new Set(rows.flatMap((r) => [r.recipientId, r.respondedBy].filter(Boolean) as string[]))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    subjectGroup: r.subjectGroup,
    question: r.question,
    recipientId: r.recipientId,
    recipientName: r.recipientId ? userMap.get(r.recipientId) ?? null : null,
    dueDate: r.dueDate ? r.dueDate.toISOString().slice(0, 10) : null,
    status: r.status,
    response: r.response,
    respondedBy: r.respondedBy,
    respondedByName: r.respondedBy ? userMap.get(r.respondedBy) ?? null : null,
    respondedAt: r.respondedAt ? r.respondedAt.toISOString() : null,
    projectId: r.projectId,
    wbsNodeId: r.wbsNodeId,
    activityId: r.activityId,
    requirementId: r.requirementId,
    updatedAt: r.updatedAt,
  }));
}

export async function getRfi(organizationId: string, rfiId: string): Promise<RfiRow> {
  const r = await prisma.rfi.findFirst({ where: { id: rfiId, organizationId, deletedAt: null } });
  if (!r) throw new AppError("NOT_FOUND", "RFI não encontrado.");
  const userIds = [r.recipientId, r.respondedBy].filter(Boolean) as string[];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  return {
    id: r.id,
    code: r.code,
    title: r.title,
    subjectGroup: r.subjectGroup,
    question: r.question,
    recipientId: r.recipientId,
    recipientName: r.recipientId ? userMap.get(r.recipientId) ?? null : null,
    dueDate: r.dueDate ? r.dueDate.toISOString().slice(0, 10) : null,
    status: r.status,
    response: r.response,
    respondedBy: r.respondedBy,
    respondedByName: r.respondedBy ? userMap.get(r.respondedBy) ?? null : null,
    respondedAt: r.respondedAt ? r.respondedAt.toISOString() : null,
    projectId: r.projectId,
    wbsNodeId: r.wbsNodeId,
    activityId: r.activityId,
    requirementId: r.requirementId,
    updatedAt: r.updatedAt,
  };
}