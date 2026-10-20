import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import {
  DEFAULT_IMPACT_LABELS,
  DEFAULT_PROBABILITY_LABELS,
  DEFAULT_RISK_MATRIX,
  isRiskOpen,
  residualRiskLevel,
  riskLevel,
  type RiskCategory,
  type RiskLevel,
  type RiskMatrixSpec,
  type RiskResponseStrategy,
  type RiskStatus,
} from "@/modules/risk/engine";

// Leituras de risco (E10, §32) — sempre escopadas pelo organization_id.
// Nível (LOW/…/CRITICAL) é DERIVADO na leitura pela matriz da organização,
// nunca tratado como verdade própria.

export async function assertRiskProject(organizationId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: null },
    select: { id: true, code: true, name: true },
  });
  if (!project) {
    throw new AppError("NOT_FOUND", "Projeto não encontrado nesta organização.");
  }
  return project;
}

function isoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export interface EffectiveRiskMatrix extends RiskMatrixSpec {
  probabilityLabels: string[];
  impactLabels: string[];
  isCustom: boolean;
}

// Matriz efetiva da organização: registro customizado ou default do motor.
export async function getEffectiveRiskMatrix(
  organizationId: string
): Promise<EffectiveRiskMatrix> {
  const config = await prisma.riskMatrixConfig.findUnique({
    where: { organizationId },
  });
  if (!config) {
    return {
      ...DEFAULT_RISK_MATRIX,
      probabilityLabels: [...DEFAULT_PROBABILITY_LABELS],
      impactLabels: [...DEFAULT_IMPACT_LABELS],
      isCustom: false,
    };
  }
  return {
    lowMax: config.lowMax,
    mediumMax: config.mediumMax,
    highMax: config.highMax,
    probabilityLabels: config.probabilityLabels as string[],
    impactLabels: config.impactLabels as string[],
    isCustom: true,
  };
}

// ownerId não tem FK (mesmo padrão de Requirement.ownerId) — nomes resolvidos
// numa consulta à parte.
async function resolveOwnerNames(ownerIds: Set<string>): Promise<Map<string, string>> {
  if (ownerIds.size === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: [...ownerIds] } },
    select: { id: true, name: true },
  });
  return new Map(users.map((user) => [user.id, user.name]));
}

export interface RiskRow {
  id: string;
  code: string;
  title: string;
  cause: string | null;
  event: string | null;
  effect: string | null;
  category: RiskCategory;
  probability: number;
  impact: number;
  exposure: number;
  level: RiskLevel;
  ownerId: string | null;
  ownerName: string | null;
  response: RiskResponseStrategy | null;
  action: string | null;
  dueDate: string | null;
  status: RiskStatus;
  isOpen: boolean;
  residualProbability: number | null;
  residualImpact: number | null;
  residualExposure: number | null;
  residualLevel: RiskLevel | null;
  residualNotes: string | null;
  wbsNodeId: string | null;
  wbsNodeCode: string | null;
  wbsNodeName: string | null;
  activityId: string | null;
  activityCode: string | null;
  activityName: string | null;
  costItemId: string | null;
  costItemCode: string | null;
  analyzedAt: string | null;
  closedAt: string | null;
  responseCount: number;
  version: number;
}

interface RiskRecord {
  id: string;
  code: string;
  title: string;
  cause: string | null;
  event: string | null;
  effect: string | null;
  category: RiskCategory;
  probability: number;
  impact: number;
  exposure: number;
  ownerId: string | null;
  response: RiskResponseStrategy | null;
  action: string | null;
  dueDate: Date | null;
  status: RiskStatus;
  residualProbability: number | null;
  residualImpact: number | null;
  residualExposure: number | null;
  residualNotes: string | null;
  wbsNodeId: string | null;
  wbsNode: { code: string; name: string } | null;
  activityId: string | null;
  activity: { code: string; name: string } | null;
  costItemId: string | null;
  costItem: { code: string } | null;
  analyzedAt: Date | null;
  closedAt: Date | null;
  _count: { responses: number };
  version: number;
}

function toRiskRow(
  row: RiskRecord,
  matrix: EffectiveRiskMatrix,
  ownerNames: Map<string, string>
): RiskRow {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    cause: row.cause,
    event: row.event,
    effect: row.effect,
    category: row.category,
    probability: row.probability,
    impact: row.impact,
    exposure: row.exposure,
    level: riskLevel(row.exposure, matrix),
    ownerId: row.ownerId,
    ownerName: row.ownerId ? (ownerNames.get(row.ownerId) ?? null) : null,
    response: row.response,
    action: row.action,
    dueDate: isoDate(row.dueDate),
    status: row.status,
    isOpen: isRiskOpen(row.status),
    residualProbability: row.residualProbability,
    residualImpact: row.residualImpact,
    residualExposure: row.residualExposure,
    residualLevel: residualRiskLevel(row.residualExposure, matrix),
    residualNotes: row.residualNotes,
    wbsNodeId: row.wbsNodeId,
    wbsNodeCode: row.wbsNode?.code ?? null,
    wbsNodeName: row.wbsNode?.name ?? null,
    activityId: row.activityId,
    activityCode: row.activity?.code ?? null,
    activityName: row.activity?.name ?? null,
    costItemId: row.costItemId,
    costItemCode: row.costItem?.code ?? null,
    analyzedAt: isoDate(row.analyzedAt),
    closedAt: isoDate(row.closedAt),
    responseCount: row._count.responses,
    version: row.version,
  };
}

const riskInclude = {
  wbsNode: { select: { code: true, name: true } },
  activity: { select: { code: true, name: true } },
  costItem: { select: { code: true } },
  _count: { select: { responses: true } },
} as const;

async function rowsToRiskRows(
  rows: RiskRecord[],
  matrix: EffectiveRiskMatrix
): Promise<RiskRow[]> {
  const ownerNames = await resolveOwnerNames(
    new Set(rows.map((row) => row.ownerId).filter((id): id is string => Boolean(id)))
  );
  return rows.map((row) => toRiskRow(row, matrix, ownerNames));
}

export async function listRisks(
  organizationId: string,
  projectId: string
): Promise<RiskRow[]> {
  await assertRiskProject(organizationId, projectId);
  const [rows, matrix] = await Promise.all([
    prisma.risk.findMany({
      where: { organizationId, projectId, deletedAt: null },
      include: riskInclude,
      orderBy: [{ exposure: "desc" }, { code: "asc" }],
    }),
    getEffectiveRiskMatrix(organizationId),
  ]);
  return rowsToRiskRows(rows, matrix);
}

export async function getRiskRow(
  organizationId: string,
  riskId: string
): Promise<RiskRow> {
  const [row, matrix] = await Promise.all([
    prisma.risk.findFirst({
      where: { id: riskId, organizationId, deletedAt: null },
      include: riskInclude,
    }),
    getEffectiveRiskMatrix(organizationId),
  ]);
  if (!row) {
    throw new AppError("NOT_FOUND", "Risco não encontrado nesta organização.");
  }
  const [risk] = await rowsToRiskRows([row], matrix);
  return risk;
}

export interface RiskResponseRow {
  id: string;
  strategy: RiskResponseStrategy;
  action: string | null;
  ownerId: string | null;
  ownerName: string | null;
  dueDate: string | null;
  notes: string | null;
  createdAt: string;
}

export async function listRiskResponses(
  organizationId: string,
  riskId: string
): Promise<RiskResponseRow[]> {
  const rows = await prisma.riskResponse.findMany({
    where: { organizationId, riskId },
    orderBy: { createdAt: "desc" },
  });
  const ownerNames = await resolveOwnerNames(
    new Set(rows.map((row) => row.ownerId).filter((id): id is string => Boolean(id)))
  );
  return rows.map((row) => ({
    id: row.id,
    strategy: row.strategy,
    action: row.action,
    ownerId: row.ownerId,
    ownerName: row.ownerId ? (ownerNames.get(row.ownerId) ?? null) : null,
    dueDate: isoDate(row.dueDate),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  }));
}

export interface RiskSummaryRow {
  projectId: string;
  totalCount: number;
  openCount: number;
  criticalCount: number;
  highCount: number;
  overdueCount: number;
}

// Resumo por projeto para a visão global /riscos (níveis altos/críticos pela
// matriz efetiva da organização; atrasados = dueDate vencido e risco aberto).
export async function listRiskSummaries(
  organizationId: string
): Promise<RiskSummaryRow[]> {
  const [risks, matrix] = await Promise.all([
    prisma.risk.findMany({
      where: { organizationId, deletedAt: null },
      select: { projectId: true, status: true, exposure: true, dueDate: true },
    }),
    getEffectiveRiskMatrix(organizationId),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const byProject = new Map<string, RiskSummaryRow>();
  for (const risk of risks) {
    const summary = byProject.get(risk.projectId) ?? {
      projectId: risk.projectId,
      totalCount: 0,
      openCount: 0,
      criticalCount: 0,
      highCount: 0,
      overdueCount: 0,
    };
    summary.totalCount += 1;
    if (isRiskOpen(risk.status)) {
      summary.openCount += 1;
      const level = riskLevel(risk.exposure, matrix);
      if (level === "CRITICAL") summary.criticalCount += 1;
      if (level === "HIGH") summary.highCount += 1;
      if (risk.dueDate && isoDate(risk.dueDate)! < today) summary.overdueCount += 1;
    }
    byProject.set(risk.projectId, summary);
  }
  return [...byProject.values()];
}
