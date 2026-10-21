// Motor de mudanças (E11, §31): workflow obrigatório
// DRAFT → SUBMITTED → IMPACT_ANALYSIS → WAITING_APPROVAL → APPROVED/REJECTED
// → IMPLEMENTED → VERIFIED → CLOSED (+ CANCELLED pré-aprovação), dimensões
// de impacto (ChangeImpact) e severidade consolidada. Funções puras — sem I/O.

export const CHANGE_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "IMPACT_ANALYSIS",
  "WAITING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "IMPLEMENTED",
  "VERIFIED",
  "CLOSED",
  "CANCELLED",
] as const;

export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

export const CHANGE_STATUS_LABELS_PT: Record<ChangeStatus, string> = {
  DRAFT: "Rascunho",
  SUBMITTED: "Submetida",
  IMPACT_ANALYSIS: "Análise de impacto",
  WAITING_APPROVAL: "Aguardando aprovação",
  APPROVED: "Aprovada",
  REJECTED: "Rejeitada",
  IMPLEMENTED: "Implementada",
  VERIFIED: "Verificada",
  CLOSED: "Encerrada",
  CANCELLED: "Cancelada",
};

// As 11 dimensões avaliadas pelo ChangeImpact (§31) — a categoria da mudança
// usa o mesmo domínio (dimensão principal da mudança).
export const CHANGE_DIMENSIONS = [
  "SCOPE",
  "COST",
  "SCHEDULE",
  "QUALITY",
  "RISK",
  "CONTRACT",
  "DOCUMENT",
  "OPERATION",
  "REGULATORY",
  "ENVIRONMENTAL",
  "SUSTAINABILITY",
] as const;

export type ChangeDimension = (typeof CHANGE_DIMENSIONS)[number];

export const CHANGE_DIMENSION_LABELS_PT: Record<ChangeDimension, string> = {
  SCOPE: "Escopo",
  COST: "Custo",
  SCHEDULE: "Prazo",
  QUALITY: "Qualidade",
  RISK: "Riscos",
  CONTRACT: "Contratos",
  DOCUMENT: "Documentos",
  OPERATION: "Operação",
  REGULATORY: "Regulatório",
  ENVIRONMENTAL: "Ambiental",
  SUSTAINABILITY: "Sustentabilidade",
};

export const IMPACT_SEVERITIES = ["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export type ImpactSeverity = (typeof IMPACT_SEVERITIES)[number];

export const IMPACT_SEVERITY_LABELS_PT: Record<ImpactSeverity, string> = {
  NONE: "Nenhum",
  LOW: "Baixo",
  MEDIUM: "Médio",
  HIGH: "Alto",
  CRITICAL: "Crítico",
};

// Severidade "peso" para o consolidado (a maior severidade entre as dimensões).
const SEVERITY_WEIGHT: Record<ImpactSeverity, number> = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export function overallImpactSeverity(
  severities: readonly ImpactSeverity[]
): ImpactSeverity {
  let best: ImpactSeverity = "NONE";
  for (const severity of severities) {
    if (SEVERITY_WEIGHT[severity] > SEVERITY_WEIGHT[best]) best = severity;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Máquina de estados do workflow §31.
// ---------------------------------------------------------------------------

export const CHANGE_ACTIONS = [
  "SUBMIT",
  "START_ANALYSIS",
  "REQUEST_APPROVAL",
  "APPROVE",
  "REJECT",
  "IMPLEMENT",
  "VERIFY",
  "CLOSE",
  "CANCEL",
] as const;

export type ChangeAction = (typeof CHANGE_ACTIONS)[number];

export const CHANGE_ACTION_LABELS_PT: Record<ChangeAction, string> = {
  SUBMIT: "Submeter",
  START_ANALYSIS: "Iniciar análise de impacto",
  REQUEST_APPROVAL: "Enviar para aprovação",
  APPROVE: "Aprovar",
  REJECT: "Rejeitar",
  IMPLEMENT: "Registrar implementação",
  VERIFY: "Verificar implementação",
  CLOSE: "Encerrar",
  CANCEL: "Cancelar",
};

export const CHANGE_TRANSITIONS: Record<
  ChangeStatus,
  Partial<Record<ChangeAction, ChangeStatus>>
> = {
  DRAFT: { SUBMIT: "SUBMITTED", CANCEL: "CANCELLED" },
  SUBMITTED: { START_ANALYSIS: "IMPACT_ANALYSIS", CANCEL: "CANCELLED" },
  IMPACT_ANALYSIS: { REQUEST_APPROVAL: "WAITING_APPROVAL", CANCEL: "CANCELLED" },
  WAITING_APPROVAL: { APPROVE: "APPROVED", REJECT: "REJECTED" },
  APPROVED: { IMPLEMENT: "IMPLEMENTED" },
  REJECTED: {},
  IMPLEMENTED: { VERIFY: "VERIFIED" },
  VERIFIED: { CLOSE: "CLOSED" },
  CLOSED: {},
  CANCELLED: {},
};

export function nextChangeStatus(
  current: ChangeStatus,
  action: ChangeAction
): ChangeStatus | null {
  return CHANGE_TRANSITIONS[current]?.[action] ?? null;
}

export function availableChangeActions(current: ChangeStatus): ChangeAction[] {
  return Object.keys(CHANGE_TRANSITIONS[current] ?? {}) as ChangeAction[];
}

export function isChangeTerminal(status: ChangeStatus): boolean {
  return status === "CLOSED" || status === "REJECTED" || status === "CANCELLED";
}

export function isChangeOpen(status: ChangeStatus): boolean {
  return !isChangeTerminal(status);
}

// Editável via PATCH: o pedido em si só em DRAFT; a análise de impacto
// (ChangeImpact) também pode ser gravada em IMPACT_ANALYSIS.
export function isChangeEditable(status: ChangeStatus): boolean {
  return status === "DRAFT" || status === "IMPACT_ANALYSIS";
}

// Ações que exigem CHANGE:APPROVE / CHANGE:REJECT na API (as demais usam
// CHANGE:EDIT).
export function isApprovalAction(action: ChangeAction): boolean {
  return action === "APPROVE";
}

export function isRejectionAction(action: ChangeAction): boolean {
  return action === "REJECT";
}
