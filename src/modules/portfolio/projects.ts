import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { ensureProjectGateInstances } from "@/modules/gates/instances";

// Projetos (E03-US03, §14). Na criação, snapshot de configuração do projeto:
// instâncias de gate são criadas a partir das definições ativas (§15.1) —
// alterações futuras na definição não mudam gates existentes.

interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

export interface ProjectInput {
  code: string;
  name: string;
  description?: string;
  clientId?: string | null;
  projectType?: string;
  location?: string;
  projectTemplateId?: string | null;
  projectManagerId?: string | null;
  sponsorId?: string | null;
  startDate?: string | null;
  plannedEndDate?: string | null;
  contractEndDate?: string | null;
  currency?: string;
  contractValue?: number | null;
  timezone?: string;
  status?: "DRAFT" | "QUALIFICATION" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED" | "ARCHIVED";
}

function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return new Date(`${value}T00:00:00.000Z`);
}

async function assertRelations(
  organizationId: string,
  input: { clientId?: string | null; projectTemplateId?: string | null; projectManagerId?: string | null }
) {
  if (input.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: input.clientId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!client) {
      throw new AppError("VALIDATION_ERROR", "Cliente inválido para esta organização.");
    }
  }
  if (input.projectTemplateId) {
    const template = await prisma.projectTemplate.findFirst({
      where: { id: input.projectTemplateId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!template) {
      throw new AppError("VALIDATION_ERROR", "Template inválido para esta organização.");
    }
  }
  if (input.projectManagerId) {
    const membership = await prisma.organizationMembership.findFirst({
      where: {
        organizationId,
        userId: input.projectManagerId,
        status: "ACTIVE",
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!membership) {
      throw new AppError("VALIDATION_ERROR", "Gerente não é membro ativo desta organização.");
    }
  }
}

export async function createProject(input: ActorContext & ProjectInput) {
  const code = input.code.trim().toUpperCase();
  const existing = await prisma.project.findFirst({
    where: { organizationId: input.organizationId, code, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    throw new AppError("CONFLICT", `Código de projeto "${code}" já existe.`);
  }
  await assertRelations(input.organizationId, input);

  const project = await prisma.project.create({
    data: {
      organizationId: input.organizationId,
      code,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      clientId: input.clientId ?? null,
      projectType: input.projectType?.trim() || null,
      location: input.location?.trim() || null,
      projectTemplateId: input.projectTemplateId ?? null,
      projectManagerId: input.projectManagerId ?? null,
      sponsorId: input.sponsorId ?? null,
      startDate: toDate(input.startDate) ?? null,
      plannedEndDate: toDate(input.plannedEndDate) ?? null,
      contractEndDate: toDate(input.contractEndDate) ?? null,
      currency: input.currency?.trim().toUpperCase() || "BRL",
      contractValue: input.contractValue ?? null,
      timezone: input.timezone?.trim() || "America/Sao_Paulo",
      status: input.status ?? "DRAFT",
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });

  // Snapshot de configuração (§15.1): instâncias de gate do projeto.
  await ensureProjectGateInstances(input.organizationId, project.id, input.actorId);

  await prisma.$transaction(async (tx) => {
    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        projectId: project.id,
        objectType: "Project",
        objectId: project.id,
        action: "CREATE",
        newValue: { code: project.code, name: project.name, status: project.status },
        correlationId: input.correlationId ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
    await tx.domainEvent.create({
      data: {
        organizationId: input.organizationId,
        projectId: project.id,
        actorId: input.actorId,
        eventType: "Project.Created",
        aggregateType: "Project",
        aggregateId: project.id,
        payload: { code: project.code, name: project.name },
      },
    });
  });

  return project;
}

export async function updateProject(
  input: ActorContext & { projectId: string } & Partial<ProjectInput>
) {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, organizationId: input.organizationId, deletedAt: null },
  });
  if (!project) {
    throw new AppError("NOT_FOUND", "Projeto não encontrado nesta organização.");
  }

  if (input.code !== undefined) {
    const code = input.code.trim().toUpperCase();
    if (code !== project.code) {
      const duplicate = await prisma.project.findFirst({
        where: {
          organizationId: input.organizationId,
          code,
          deletedAt: null,
          id: { not: project.id },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new AppError("CONFLICT", `Código de projeto "${code}" já existe.`);
      }
    }
  }
  await assertRelations(input.organizationId, {
    clientId: input.clientId !== undefined ? input.clientId : undefined,
    projectTemplateId:
      input.projectTemplateId !== undefined ? input.projectTemplateId : undefined,
    projectManagerId:
      input.projectManagerId !== undefined ? input.projectManagerId : undefined,
  });

  const updated = await prisma.project.update({
    where: { id: project.id },
    data: {
      ...(input.code !== undefined ? { code: input.code.trim().toUpperCase() } : {}),
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
      ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
      ...(input.projectType !== undefined
        ? { projectType: input.projectType?.trim() || null }
        : {}),
      ...(input.location !== undefined ? { location: input.location?.trim() || null } : {}),
      ...(input.projectTemplateId !== undefined
        ? { projectTemplateId: input.projectTemplateId }
        : {}),
      ...(input.projectManagerId !== undefined
        ? { projectManagerId: input.projectManagerId }
        : {}),
      ...(input.sponsorId !== undefined ? { sponsorId: input.sponsorId } : {}),
      ...(input.startDate !== undefined ? { startDate: toDate(input.startDate) } : {}),
      ...(input.plannedEndDate !== undefined
        ? { plannedEndDate: toDate(input.plannedEndDate) }
        : {}),
      ...(input.contractEndDate !== undefined
        ? { contractEndDate: toDate(input.contractEndDate) }
        : {}),
      ...(input.currency !== undefined ? { currency: input.currency.trim().toUpperCase() } : {}),
      ...(input.contractValue !== undefined ? { contractValue: input.contractValue } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone.trim() } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      updatedBy: input.actorId,
      version: { increment: 1 },
    },
  });

  // BR-001: fase só muda pelo endpoint dedicado — currentPhase é ignorado aqui.
  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      projectId: project.id,
      objectType: "Project",
      objectId: project.id,
      action: "UPDATE",
      oldValue: { code: project.code, name: project.name, status: project.status },
      newValue: { code: updated.code, name: updated.name, status: updated.status },
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });

  return updated;
}

export async function deleteProject(input: ActorContext & { projectId: string }) {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, organizationId: input.organizationId, deletedAt: null },
    select: { id: true, code: true, name: true },
  });
  if (!project) {
    throw new AppError("NOT_FOUND", "Projeto não encontrado nesta organização.");
  }

  await prisma.project.update({
    where: { id: project.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      projectId: project.id,
      objectType: "Project",
      objectId: project.id,
      action: "DELETE",
      oldValue: { code: project.code, name: project.name },
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });

  return { projectId: project.id };
}
