import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";

// Templates de projeto (E03-US04). O conteúdo completo (WBS, checklists…)
// chega nas fases seguintes; gates são configuração da organização (§17.1).

interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

export interface TemplateInput {
  code: string;
  name: string;
  description?: string;
  isDefault?: boolean;
}

export interface TemplateUpdateInput {
  code?: string;
  name?: string;
  description?: string | null;
  isDefault?: boolean;
}

async function assertCodeAvailable(
  organizationId: string,
  code: string,
  excludeId?: string
) {
  const existing = await prisma.projectTemplate.findFirst({
    where: {
      organizationId,
      code,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    throw new AppError("CONFLICT", `Código de template "${code}" já existe.`);
  }
}

export async function createTemplate(input: ActorContext & TemplateInput) {
  const code = input.code.trim().toUpperCase();
  await assertCodeAvailable(input.organizationId, code);

  if (input.isDefault) {
    await prisma.projectTemplate.updateMany({
      where: { organizationId: input.organizationId, isDefault: true, deletedAt: null },
      data: { isDefault: false, updatedBy: input.actorId },
    });
  }

  const template = await prisma.projectTemplate.create({
    data: {
      organizationId: input.organizationId,
      code,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      isDefault: input.isDefault ?? false,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      objectType: "ProjectTemplate",
      objectId: template.id,
      action: "CREATE",
      newValue: { code: template.code, name: template.name },
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });

  return template;
}

export async function updateTemplate(
  input: ActorContext & { templateId: string } & TemplateUpdateInput
) {
  const template = await prisma.projectTemplate.findFirst({
    where: {
      id: input.templateId,
      organizationId: input.organizationId,
      deletedAt: null,
    },
  });
  if (!template) {
    throw new AppError("NOT_FOUND", "Template não encontrado nesta organização.");
  }

  if (input.code !== undefined) {
    const code = input.code.trim().toUpperCase();
    if (code !== template.code) {
      await assertCodeAvailable(input.organizationId, code, template.id);
    }
  }

  if (input.isDefault === true) {
    await prisma.projectTemplate.updateMany({
      where: {
        organizationId: input.organizationId,
        isDefault: true,
        deletedAt: null,
        id: { not: template.id },
      },
      data: { isDefault: false, updatedBy: input.actorId },
    });
  }

  const updated = await prisma.projectTemplate.update({
    where: { id: template.id },
    data: {
      ...(input.code !== undefined ? { code: input.code.trim().toUpperCase() } : {}),
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
      ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      updatedBy: input.actorId,
      version: { increment: 1 },
    },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      objectType: "ProjectTemplate",
      objectId: template.id,
      action: "UPDATE",
      oldValue: { code: template.code, name: template.name },
      newValue: { code: updated.code, name: updated.name },
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });

  return updated;
}

export async function deleteTemplate(input: ActorContext & { templateId: string }) {
  const template = await prisma.projectTemplate.findFirst({
    where: {
      id: input.templateId,
      organizationId: input.organizationId,
      deletedAt: null,
    },
    select: { id: true, code: true, name: true },
  });
  if (!template) {
    throw new AppError("NOT_FOUND", "Template não encontrado nesta organização.");
  }

  const projects = await prisma.project.count({
    where: { projectTemplateId: template.id, deletedAt: null },
  });
  if (projects > 0) {
    throw new AppError(
      "CONFLICT",
      `Template usado por ${projects} projeto(s) ativo(s) e não pode ser removido.`
    );
  }

  await prisma.projectTemplate.update({
    where: { id: template.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      objectType: "ProjectTemplate",
      objectId: template.id,
      action: "DELETE",
      oldValue: { code: template.code, name: template.name },
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });

  return { templateId: template.id };
}
