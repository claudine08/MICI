import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import {
  buildDrpDocument,
  g1ApprovalBlocks,
  type DrpDocument,
  type DrpRequirementInput,
  type G1ApprovalBlock,
} from "@/modules/requirements/engine";

// Leituras de requisitos — sempre escopadas pelo organization_id do contexto.

export interface RequirementRow {
  id: string;
  projectId: string;
  code: string;
  description: string;
  category: string;
  source: string | null;
  sourceValidUntil: Date | null;
  priority: string;
  ownerId: string | null;
  ownerName: string | null;
  acceptanceCriteria: string | null;
  requiredEvidence: string | null;
  status: string;
  wbsNodeId: string | null;
  wbsNodeCode: string | null;
  wbsNodeName: string | null;
  documentLinks: { label: string; url: string }[];
  lastReviewedAt: Date | null;
  revision: number;
  evidenceCount: number;
  updatedAt: Date;
}

export interface ListRequirementsOptions {
  projectId?: string;
  status?: string;
  category?: string;
  search?: string;
}

type RequirementRecord = {
  id: string;
  projectId: string;
  code: string;
  description: string;
  category: string;
  source: string | null;
  sourceValidUntil: Date | null;
  priority: string;
  ownerId: string | null;
  acceptanceCriteria: string | null;
  requiredEvidence: string | null;
  status: string;
  wbsNodeId: string | null;
  documentLinks: unknown;
  lastReviewedAt: Date | null;
  revision: number;
  updatedAt: Date;
  wbsNode: { code: string; name: string } | null;
  _count: { evidences: number };
};

// ownerId não tem FK (mesmo padrão de Project.projectManagerId) — os nomes dos
// responsáveis são resolvidos em lote para não custear uma consulta por linha.
async function resolveOwnerNames(ownerIds: Set<string>): Promise<Map<string, string>> {
  if (ownerIds.size === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: [...ownerIds] } },
    select: { id: true, name: true },
  });
  return new Map(users.map((user) => [user.id, user.name]));
}

function toRow(record: RequirementRecord, ownerNames: Map<string, string>): RequirementRow {
  const links = Array.isArray(record.documentLinks)
    ? (record.documentLinks as { label?: unknown; url?: unknown }[])
        .filter((link) => typeof link?.label === "string" && typeof link?.url === "string")
        .map((link) => ({ label: link.label as string, url: link.url as string }))
    : [];

  return {
    id: record.id,
    projectId: record.projectId,
    code: record.code,
    description: record.description,
    category: record.category,
    source: record.source,
    sourceValidUntil: record.sourceValidUntil,
    priority: record.priority,
    ownerId: record.ownerId,
    ownerName: record.ownerId ? (ownerNames.get(record.ownerId) ?? null) : null,
    acceptanceCriteria: record.acceptanceCriteria,
    requiredEvidence: record.requiredEvidence,
    status: record.status,
    wbsNodeId: record.wbsNodeId,
    wbsNodeCode: record.wbsNode?.code ?? null,
    wbsNodeName: record.wbsNode?.name ?? null,
    documentLinks: links,
    lastReviewedAt: record.lastReviewedAt,
    revision: record.revision,
    evidenceCount: record._count.evidences,
    updatedAt: record.updatedAt,
  };
}

const requirementInclude = {
  wbsNode: { select: { code: true, name: true } },
  _count: { select: { evidences: true } },
} as const;

export async function listRequirements(
  organizationId: string,
  options: ListRequirementsOptions = {}
): Promise<RequirementRow[]> {
  const search = options.search?.trim();
  const records = await prisma.requirement.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...(options.projectId ? { projectId: options.projectId } : {}),
      ...(options.status ? { status: options.status as never } : {}),
      ...(options.category ? { category: options.category as never } : {}),
      ...(search
        ? {
            OR: [
              { description: { contains: search, mode: "insensitive" } },
              { code: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: requirementInclude,
    orderBy: [{ projectId: "asc" }, { code: "asc" }],
  });
  const items = records as unknown as RequirementRecord[];
  const ownerNames = await resolveOwnerNames(
    new Set(items.map((record) => record.ownerId).filter((id): id is string => Boolean(id)))
  );
  return items.map((record) => toRow(record, ownerNames));
}

export interface RequirementEvidenceRow {
  id: string;
  label: string;
  url: string | null;
  createdAt: Date;
}

export interface RequirementDetail extends RequirementRow {
  version: number;
  evidences: RequirementEvidenceRow[];
}

export async function getRequirementDetail(
  organizationId: string,
  requirementId: string
): Promise<RequirementDetail> {
  const record = await prisma.requirement.findFirst({
    where: { id: requirementId, organizationId, deletedAt: null },
    include: {
      ...requirementInclude,
      evidences: { orderBy: { createdAt: "asc" as const } },
    },
  });
  if (!record) {
    throw new AppError("NOT_FOUND", "Requisito não encontrado nesta organização.");
  }
  const typed = record as unknown as RequirementRecord & {
    version: number;
    evidences: RequirementEvidenceRow[];
  };
  const ownerNames = await resolveOwnerNames(
    new Set(typed.ownerId ? [typed.ownerId] : [])
  );
  return {
    ...toRow(typed, ownerNames),
    version: typed.version,
    evidences: typed.evidences,
  };
}

export interface RequirementRevisionRow {
  id: string;
  revision: number;
  snapshot: unknown;
  changeSummary: string | null;
  createdAt: Date;
  createdBy: string | null;
}

export async function listRequirementRevisions(
  organizationId: string,
  requirementId: string
): Promise<RequirementRevisionRow[]> {
  const requirement = await prisma.requirement.findFirst({
    where: { id: requirementId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!requirement) {
    throw new AppError("NOT_FOUND", "Requisito não encontrado nesta organização.");
  }
  const revisions = await prisma.requirementRevision.findMany({
    where: { organizationId, requirementId },
    orderBy: { revision: "desc" },
    select: {
      id: true,
      revision: true,
      snapshot: true,
      changeSummary: true,
      createdAt: true,
      createdBy: true,
    },
  });
  return revisions;
}

// Entrada do DRP (§20) — todos os requisitos vivos do projeto, por código.
export async function getDrpRequirements(
  organizationId: string,
  projectId: string
): Promise<DrpRequirementInput[]> {
  const rows = await listRequirements(organizationId, { projectId });
  return rows.map((row) => ({
    code: row.code,
    description: row.description,
    category: row.category,
    source: row.source,
    sourceValidUntil: row.sourceValidUntil,
    priority: row.priority,
    ownerName: row.ownerName,
    acceptanceCriteria: row.acceptanceCriteria,
    requiredEvidence: row.requiredEvidence,
    status: row.status,
    wbsNode: row.wbsNodeCode ? { code: row.wbsNodeCode, name: row.wbsNodeName ?? "" } : null,
    documentLinks: row.documentLinks,
    lastReviewedAt: row.lastReviewedAt,
    revision: row.revision,
  }));
}

// E04-US05 — geração do DRP (§20) a partir dos requisitos vivos do projeto.
export async function getDrpDocument(
  organizationId: string,
  projectId: string,
  generatedBy: string
): Promise<DrpDocument> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: null },
    select: { code: true, name: true, currentPhase: true },
  });
  if (!project) {
    throw new AppError("NOT_FOUND", "Projeto não encontrado nesta organização.");
  }
  const requirements = await getDrpRequirements(organizationId, projectId);
  return buildDrpDocument({ project, requirements, generatedBy });
}

// §18 — G1 (Requisitos suficientes): checagem usada na aprovação do gate.
export async function getG1ApprovalBlocks(
  organizationId: string,
  projectId: string
): Promise<G1ApprovalBlock[]> {
  const [requirements, evidenceCount] = await Promise.all([
    prisma.requirement.findMany({
      where: { organizationId, projectId, deletedAt: null },
      select: {
        code: true,
        description: true,
        status: true,
        acceptanceCriteria: true,
        ownerId: true,
      },
    }),
    prisma.requirementEvidence.count({
      where: { organizationId, requirement: { projectId, deletedAt: null } },
    }),
  ]);

  return g1ApprovalBlocks(
    requirements.map((requirement) => ({
      code: requirement.code,
      description: requirement.description,
      status: requirement.status,
      acceptanceCriteria: requirement.acceptanceCriteria,
      ownerId: requirement.ownerId,
    })),
    evidenceCount
  );
}
