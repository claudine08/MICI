// Motor puro de requisitos e DRP (E04, §20, BR-008, BR-015, §18-G1).
// Funções sem I/O — testáveis em unit tests; serviços orquestram Prisma/auditoria.

export const REQUIREMENT_CATEGORIES = [
  "OPERATION",
  "EQUIPMENT",
  "BUILDING",
  "ENGINEERING",
  "COMPLIANCE",
  "SUSTAINABILITY",
] as const;

export type RequirementCategoryValue = (typeof REQUIREMENT_CATEGORIES)[number];

export const REQUIREMENT_CATEGORY_LABELS: Record<RequirementCategoryValue, string> = {
  OPERATION: "A — Operação",
  EQUIPMENT: "B — Equipamentos",
  BUILDING: "C — Edificação",
  ENGINEERING: "D — Engenharia",
  COMPLIANCE: "E — Conformidade",
  SUSTAINABILITY: "F — Sustentabilidade",
};

export const REQUIREMENT_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export type RequirementPriorityValue = (typeof REQUIREMENT_PRIORITIES)[number];

export const REQUIREMENT_PRIORITY_LABELS: Record<RequirementPriorityValue, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

export const REQUIREMENT_STATUSES = ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"] as const;

export type RequirementStatusValue = (typeof REQUIREMENT_STATUSES)[number];

export const REQUIREMENT_STATUS_LABELS: Record<RequirementStatusValue, string> = {
  DRAFT: "Rascunho",
  ACTIVE: "Ativo",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
};

// ---------------------------------------------------------------------------
// Máquina de estados (E04-US02 — versionamento acompanhado de transição)
// ---------------------------------------------------------------------------

const REQUIREMENT_TRANSITIONS: Record<RequirementStatusValue, RequirementStatusValue[]> = {
  DRAFT: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["ACTIVE"],
  CANCELLED: ["DRAFT"],
};

export function isRequirementStatus(value: string): value is RequirementStatusValue {
  return (REQUIREMENT_STATUSES as readonly string[]).includes(value);
}

export function requirementTransition(
  current: RequirementStatusValue,
  target: RequirementStatusValue
): boolean {
  if (current === target) return true;
  return (REQUIREMENT_TRANSITIONS[current] ?? []).includes(target);
}

export function allowedRequirementTransitions(
  current: RequirementStatusValue
): RequirementStatusValue[] {
  return REQUIREMENT_TRANSITIONS[current] ?? [];
}

// ---------------------------------------------------------------------------
// BR-008 — requisito concluído precisa de critério de aceite e evidência
// ---------------------------------------------------------------------------

export interface CompleteRequirementCheck {
  status: RequirementStatusValue;
  acceptanceCriteria: string | null;
  evidenceCount: number;
}

export interface RequirementRuleBlock {
  code: "BR-008" | "BR-015";
  message: string;
}

export function completeRequirementBlocks(check: CompleteRequirementCheck): RequirementRuleBlock[] {
  const blocks: RequirementRuleBlock[] = [];
  if (!check.acceptanceCriteria?.trim()) {
    blocks.push({
      code: "BR-008",
      message: "BR-008: requisito concluído exige critério de aceite preenchido.",
    });
  }
  if (check.evidenceCount === 0) {
    blocks.push({
      code: "BR-008",
      message: "BR-008: requisito concluído exige ao menos uma evidência vinculada.",
    });
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// BR-015 — requisito regulatório (bloco E — Conformidade) exige fonte e vigência
// ---------------------------------------------------------------------------

export interface RegulatoryRequirementCheck {
  category: string;
  source?: string | null;
  sourceValidUntil?: string | Date | null;
}

export function regulatoryRequirementBlocks(check: RegulatoryRequirementCheck): RequirementRuleBlock[] {
  if (check.category !== "COMPLIANCE") return [];
  const blocks: RequirementRuleBlock[] = [];
  if (!check.source?.trim()) {
    blocks.push({
      code: "BR-015",
      message: "BR-015: requisito regulatório exige a fonte (norma/licença/autoridade).",
    });
  }
  if (!check.sourceValidUntil) {
    blocks.push({
      code: "BR-015",
      message: "BR-015: requisito regulatório exige vigência (data de validade).",
    });
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Numeração automática de código (REQ-001, REQ-002, …) por projeto
// ---------------------------------------------------------------------------

const CODE_PATTERN = /^REQ-(\d{1,6})$/;

export function nextRequirementCode(existingCodes: readonly string[]): string {
  let max = 0;
  for (const code of existingCodes) {
    const match = CODE_PATTERN.exec(code.trim().toUpperCase());
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `REQ-${String(max + 1).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// DRP (§20 — E04-US05)
// ---------------------------------------------------------------------------

export interface DrpRequirementInput {
  code: string;
  description: string;
  category: string;
  source: string | null;
  sourceValidUntil: Date | null;
  priority: string;
  ownerName: string | null;
  acceptanceCriteria: string | null;
  requiredEvidence: string | null;
  status: string;
  wbsNode: { code: string; name: string } | null;
  documentLinks: { label: string; url: string }[];
  lastReviewedAt: Date | null;
  revision: number;
}

export interface DrpDocument {
  title: string;
  reference: string;
  project: { code: string; name: string; currentPhase: string };
  generatedAt: string;
  generatedBy: string;
  totals: {
    total: number;
    byStatus: Record<string, number>;
    byCategory: Record<string, number>;
  };
  requirements: DrpRequirementInput[];
}

export interface BuildDrpInput {
  project: { code: string; name: string; currentPhase: string };
  requirements: DrpRequirementInput[];
  generatedBy: string;
  generatedAt?: Date;
}

export function buildDrpDocument(input: BuildDrpInput): DrpDocument {
  const byStatus: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const requirement of input.requirements) {
    byStatus[requirement.status] = (byStatus[requirement.status] ?? 0) + 1;
    byCategory[requirement.category] = (byCategory[requirement.category] ?? 0) + 1;
  }
  return {
    title: "Documento de Requisitos do Projeto (DRP)",
    reference: "§20 — F1 Descoberta e Requisitos",
    project: input.project,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    generatedBy: input.generatedBy,
    totals: {
      total: input.requirements.length,
      byStatus,
      byCategory,
    },
    requirements: input.requirements,
  };
}

function label(list: Record<string, string>, value: string): string {
  return list[value] ?? value;
}

export function renderDrpMarkdown(document: DrpDocument): string {
  const lines: string[] = [];
  lines.push(`# ${document.title}`);
  lines.push("");
  lines.push(`Referência: ${document.reference}`);
  lines.push("");
  lines.push(`**Projeto:** ${document.project.code} — ${document.project.name}`);
  lines.push(`**Fase atual:** ${document.project.currentPhase}`);
  lines.push(`**Gerado em:** ${document.generatedAt}`);
  lines.push(`**Gerado por:** ${document.generatedBy}`);
  lines.push(`**Total de requisitos:** ${document.totals.total}`);
  lines.push("");

  for (const requirement of document.requirements) {
    lines.push(`## ${requirement.code} — ${label(REQUIREMENT_STATUS_LABELS, requirement.status)}`);
    lines.push("");
    lines.push(requirement.description);
    lines.push("");
    lines.push(`- **Categoria:** ${label(REQUIREMENT_CATEGORY_LABELS, requirement.category)}`);
    lines.push(`- **Prioridade:** ${label(REQUIREMENT_PRIORITY_LABELS, requirement.priority)}`);
    lines.push(`- **Responsável:** ${requirement.ownerName ?? "—"}`);
    lines.push(`- **Fonte:** ${requirement.source ?? "—"}`);
    lines.push(
      `- **Vigência:** ${requirement.sourceValidUntil ? requirement.sourceValidUntil.toISOString().slice(0, 10) : "—"}`
    );
    lines.push(`- **Critério de aceite:** ${requirement.acceptanceCriteria ?? "—"}`);
    lines.push(`- **Evidência exigida:** ${requirement.requiredEvidence ?? "—"}`);
    lines.push(
      `- **WBS:** ${requirement.wbsNode ? `${requirement.wbsNode.code} — ${requirement.wbsNode.name}` : "—"}`
    );
    lines.push(`- **Revisão:** ${requirement.revision}`);
    lines.push(
      `- **Última revisão em:** ${requirement.lastReviewedAt ? requirement.lastReviewedAt.toISOString().slice(0, 10) : "—"}`
    );
    if (requirement.documentLinks.length > 0) {
      const links = requirement.documentLinks.map((link) => `${link.label}: ${link.url}`).join(" · ");
      lines.push(`- **Documentos:** ${links}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// §18 — G1 (Requisitos suficientes): checagem de aprovação do gate
// ---------------------------------------------------------------------------

export interface G1RequirementInput {
  code: string;
  description: string;
  status: RequirementStatusValue;
  acceptanceCriteria: string | null;
  ownerId: string | null;
}

export interface G1ApprovalBlock {
  code: string;
  message: string;
}

export function g1ApprovalBlocks(
  requirements: G1RequirementInput[],
  evidenceCount: number
): G1ApprovalBlock[] {
  const blocks: G1ApprovalBlock[] = [];
  const relevant = requirements.filter((requirement) => requirement.status !== "CANCELLED");

  if (relevant.length === 0) {
    blocks.push({
      code: "REQUIREMENTS_INCOMPLETE",
      message: "G1 exige DRP com ao menos um requisito cadastrado.",
    });
    return blocks;
  }

  const withoutAcceptance = relevant
    .filter((requirement) => !requirement.acceptanceCriteria?.trim())
    .map((requirement) => requirement.code);
  if (withoutAcceptance.length > 0) {
    blocks.push({
      code: "REQUIREMENTS_INCOMPLETE",
      message: `G1 exige critério de aceite em todos os requisitos. Pendentes: ${withoutAcceptance.join(", ")}.`,
    });
  }

  const withoutOwner = relevant
    .filter((requirement) => !requirement.ownerId)
    .map((requirement) => requirement.code);
  if (withoutOwner.length > 0) {
    blocks.push({
      code: "REQUIREMENTS_INCOMPLETE",
      message: `G1 exige responsável definido. Pendentes: ${withoutOwner.join(", ")}.`,
    });
  }

  if (evidenceCount === 0) {
    blocks.push({
      code: "REQUIREMENTS_INCOMPLETE",
      message: "G1 exige evidências do levantamento vinculadas aos requisitos.",
    });
  }

  return blocks;
}
