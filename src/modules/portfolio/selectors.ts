import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";

// Leituras do portfólio — sempre escopadas pelo organization_id do contexto.

export interface ClientRow {
  id: string;
  code: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  projectCount: number;
  updatedAt: Date;
}

export async function listClients(organizationId: string): Promise<ClientRow[]> {
  const clients = await prisma.client.findMany({
    where: { organizationId, deletedAt: null },
    include: { _count: { select: { projects: { where: { deletedAt: null } } } } },
    orderBy: { name: "asc" },
  });
  return clients.map((client) => ({
    id: client.id,
    code: client.code,
    name: client.name,
    email: client.email,
    phone: client.phone,
    address: client.address,
    notes: client.notes,
    projectCount: client._count.projects,
    updatedAt: client.updatedAt,
  }));
}

export interface TemplateRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  projectCount: number;
  updatedAt: Date;
}

export async function listTemplates(organizationId: string): Promise<TemplateRow[]> {
  const templates = await prisma.projectTemplate.findMany({
    where: { organizationId, deletedAt: null },
    include: { _count: { select: { projects: { where: { deletedAt: null } } } } },
    orderBy: { name: "asc" },
  });
  return templates.map((template) => ({
    id: template.id,
    code: template.code,
    name: template.name,
    description: template.description,
    isDefault: template.isDefault,
    projectCount: template._count.projects,
    updatedAt: template.updatedAt,
  }));
}

export interface ProjectRow {
  id: string;
  code: string;
  name: string;
  status: string;
  currentPhase: string;
  clientName: string | null;
  templateName: string | null;
  location: string | null;
  startDate: Date | null;
  plannedEndDate: Date | null;
  updatedAt: Date;
  gates: { total: number; approved: number; pending: number };
}

export interface ListProjectsOptions {
  search?: string;
  status?: string;
}

export async function listProjects(
  organizationId: string,
  options: ListProjectsOptions = {}
): Promise<ProjectRow[]> {
  const search = options.search?.trim();
  const projects = await prisma.project.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...(options.status ? { status: options.status as never } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { code: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      client: { select: { name: true } },
      template: { select: { name: true } },
      gateInstances: { select: { status: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return projects.map((project) => {
    const total = project.gateInstances.length;
    const approved = project.gateInstances.filter(
      (gate) => gate.status === "APPROVED" || gate.status === "WAIVED"
    ).length;
    return {
      id: project.id,
      code: project.code,
      name: project.name,
      status: project.status,
      currentPhase: project.currentPhase,
      clientName: project.client?.name ?? null,
      templateName: project.template?.name ?? null,
      location: project.location,
      startDate: project.startDate,
      plannedEndDate: project.plannedEndDate,
      updatedAt: project.updatedAt,
      gates: { total, approved, pending: total - approved },
    };
  });
}

export interface ProjectDetail extends ProjectRow {
  description: string | null;
  projectType: string | null;
  clientId: string | null;
  projectTemplateId: string | null;
  projectManagerId: string | null;
  sponsorId: string | null;
  contractEndDate: Date | null;
  currency: string;
  contractValue: string | null;
  timezone: string;
  version: number;
}

export async function getProjectDetail(
  organizationId: string,
  projectId: string
): Promise<ProjectDetail> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: null },
    include: {
      client: { select: { name: true } },
      template: { select: { name: true } },
      gateInstances: { select: { status: true } },
    },
  });
  if (!project) {
    throw new AppError("NOT_FOUND", "Projeto não encontrado nesta organização.");
  }

  const total = project.gateInstances.length;
  const approved = project.gateInstances.filter(
    (gate) => gate.status === "APPROVED" || gate.status === "WAIVED"
  ).length;

  return {
    id: project.id,
    code: project.code,
    name: project.name,
    status: project.status,
    currentPhase: project.currentPhase,
    clientName: project.client?.name ?? null,
    templateName: project.template?.name ?? null,
    location: project.location,
    startDate: project.startDate,
    plannedEndDate: project.plannedEndDate,
    updatedAt: project.updatedAt,
    description: project.description,
    projectType: project.projectType,
    clientId: project.clientId,
    projectTemplateId: project.projectTemplateId,
    projectManagerId: project.projectManagerId,
    sponsorId: project.sponsorId,
    contractEndDate: project.contractEndDate,
    currency: project.currency,
    contractValue: project.contractValue?.toString() ?? null,
    timezone: project.timezone,
    version: project.version,
    gates: { total, approved, pending: total - approved },
  };
}
