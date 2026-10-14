import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/core/errors";
import { parseScheduleFile, type ParsedSchedule } from "@/modules/schedule/msproject";

// Templates de cronograma reutilizáveis (E07 import, §27): guarda o arquivo
// MS Project (CSV/XML) já parseado como snapshot normalizado — o diálogo de
// import do cronograma carrega o snapshot e aplica no projeto escolhido.

interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

function audit(
  input: ActorContext,
  action: string,
  data: { objectId: string; oldValue?: unknown; newValue?: unknown }
) {
  return prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      projectId: null,
      objectType: "ScheduleTemplate",
      objectId: data.objectId,
      action,
      ...(data.oldValue !== undefined ? { oldValue: data.oldValue as never } : {}),
      ...(data.newValue !== undefined ? { newValue: data.newValue as never } : {}),
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });
}

async function nextTemplateCode(organizationId: string): Promise<string> {
  const rows = await prisma.scheduleTemplate.findMany({
    where: { organizationId },
    select: { code: true },
  });
  let max = 0;
  for (const { code } of rows) {
    const match = /^ST(\d+)$/.exec(code);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `ST${String(max + 1).padStart(3, "0")}`;
}

export interface ScheduleTemplateRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sourceFormat: string;
  sourceFilename: string | null;
  activityCount: number;
  dependencyCount: number;
  createdAt: string;
  version: number;
}

interface TemplateRecord {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sourceFormat: string;
  sourceFilename: string | null;
  activityCount: number;
  dependencyCount: number;
  createdAt: Date;
  version: number;
}

function toTemplateRow(record: TemplateRecord): ScheduleTemplateRow {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    description: record.description,
    sourceFormat: record.sourceFormat,
    sourceFilename: record.sourceFilename,
    activityCount: record.activityCount,
    dependencyCount: record.dependencyCount,
    createdAt: record.createdAt.toISOString(),
    version: record.version,
  };
}

export async function listScheduleTemplates(organizationId: string): Promise<ScheduleTemplateRow[]> {
  const rows = await prisma.scheduleTemplate.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: [{ createdAt: "desc" }],
  });
  return rows.map(toTemplateRow);
}

export interface CreateScheduleTemplateInput extends ActorContext {
  name: string;
  description?: string;
  filename?: string;
  content: string;
}

export async function createScheduleTemplate(input: CreateScheduleTemplateInput) {
  const schedule = parseScheduleFile(input.filename ?? null, input.content);
  const code = await nextTemplateCode(input.organizationId);

  const template = await prisma.scheduleTemplate.create({
    data: {
      organizationId: input.organizationId,
      code,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      sourceFormat: schedule.sourceFormat,
      sourceFilename: input.filename?.trim() || null,
      activityCount: schedule.tasks.length,
      dependencyCount: schedule.dependencies.length,
      snapshot: schedule as unknown as Prisma.InputJsonValue,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });

  await audit(input, "CREATE", {
    objectId: template.id,
    newValue: {
      code,
      name: template.name,
      sourceFormat: schedule.sourceFormat,
      activityCount: schedule.tasks.length,
      dependencyCount: schedule.dependencies.length,
    },
  });

  return toTemplateRow(template);
}

export async function deleteScheduleTemplate(
  input: ActorContext & { templateId: string }
): Promise<{ templateId: string }> {
  const template = await prisma.scheduleTemplate.findFirst({
    where: { id: input.templateId, organizationId: input.organizationId, deletedAt: null },
  });
  if (!template) {
    throw new AppError("NOT_FOUND", "Template de cronograma não encontrado nesta organização.");
  }

  await prisma.scheduleTemplate.update({
    where: { id: template.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId },
  });

  await audit(input, "DELETE", {
    objectId: template.id,
    oldValue: { code: template.code, name: template.name },
  });

  return { templateId: template.id };
}

// Carrega o snapshot de um template salvo para a importação em um projeto.
export async function loadTemplateSchedule(
  organizationId: string,
  templateId: string
): Promise<ParsedSchedule> {
  const template = await prisma.scheduleTemplate.findFirst({
    where: { id: templateId, organizationId, deletedAt: null },
    select: { snapshot: true, name: true, code: true },
  });
  if (!template) {
    throw new AppError("NOT_FOUND", "Template de cronograma não encontrado nesta organização.");
  }
  const snapshot = template.snapshot as unknown as ParsedSchedule;
  if (!snapshot || !Array.isArray(snapshot.tasks) || snapshot.tasks.length === 0) {
    throw new AppError("VALIDATION_ERROR", "Snapshot do template inválido ou vazio.");
  }
  return { ...snapshot, sourceName: snapshot.sourceName || template.name };
}
