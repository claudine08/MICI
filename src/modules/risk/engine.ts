// Motor de riscos (E10, §32): probabilidade × impacto, níveis da matriz
// configurável e máquina de estados do ciclo Identify → Analyze → Response →
// Implement → Monitor → Close. Funções puras — sem I/O.

export const RISK_CATEGORIES = [
  "SCOPE",
  "SCHEDULE",
  "COST",
  "QUALITY",
  "SAFETY",
  "SUPPLY",
  "CONTRACTUAL",
  "REGULATORY",
  "ENVIRONMENTAL",
  "SUSTAINABILITY",
] as const;

export type RiskCategory = (typeof RISK_CATEGORIES)[number];

export const RISK_CATEGORY_LABELS_PT: Record<RiskCategory, string> = {
  SCOPE: "Escopo",
  SCHEDULE: "Prazo",
  COST: "Custo",
  QUALITY: "Qualidade",
  SAFETY: "Segurança",
  SUPPLY: "Suprimentos",
  CONTRACTUAL: "Contratual",
  REGULATORY: "Regulatório",
  ENVIRONMENTAL: "Ambiental",
  SUSTAINABILITY: "Sustentabilidade",
};

export const RISK_STATUSES = [
  "IDENTIFIED",
  "ANALYZED",
  "PLANNED",
  "TREATING",
  "MONITORING",
  "CLOSED",
  "CANCELLED",
] as const;

export type RiskStatus = (typeof RISK_STATUSES)[number];

export const RISK_STATUS_LABELS_PT: Record<RiskStatus, string> = {
  IDENTIFIED: "Identificado",
  ANALYZED: "Analisado",
  PLANNED: "Planejado",
  TREATING: "Em tratamento",
  MONITORING: "Monitoramento",
  CLOSED: "Encerrado",
  CANCELLED: "Cancelado",
};

export const RISK_RESPONSE_STRATEGIES = [
  "AVOID",
  "MITIGATE",
  "TRANSFER",
  "ACCEPT",
  "ESCALATE",
] as const;

export type RiskResponseStrategy = (typeof RISK_RESPONSE_STRATEGIES)[number];

export const RISK_RESPONSE_LABELS_PT: Record<RiskResponseStrategy, string> = {
  AVOID: "Evitar",
  MITIGATE: "Mitigar",
  TRANSFER: "Transferir",
  ACCEPT: "Aceitar",
  ESCALATE: "Escalar",
};

export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export type RiskLevel = (typeof RISK_LEVELS)[number];

export const RISK_LEVEL_LABELS_PT: Record<RiskLevel, string> = {
  LOW: "Baixo",
  MEDIUM: "Médio",
  HIGH: "Alto",
  CRITICAL: "Crítico",
};

// Matriz default: exposure 1–25 (5×5). Limites inclusivos por nível.
export interface RiskMatrixSpec {
  lowMax: number;
  mediumMax: number;
  highMax: number;
}

export const DEFAULT_RISK_MATRIX: RiskMatrixSpec = {
  lowMax: 4,
  mediumMax: 9,
  highMax: 16,
};

export const DEFAULT_PROBABILITY_LABELS = [
  "Muito baixa",
  "Baixa",
  "Média",
  "Alta",
  "Muito alta",
] as const;

export const DEFAULT_IMPACT_LABELS = [
  "Irrelevante",
  "Menor",
  "Moderado",
  "Maior",
  "Crítico",
] as const;

// Valida os limites da matriz (configurável, §32): 1 ≤ low < medium < high ≤ 25.
export function isValidMatrixSpec(matrix: RiskMatrixSpec): boolean {
  const { lowMax, mediumMax, highMax } = matrix;
  return (
    Number.isInteger(lowMax) &&
    Number.isInteger(mediumMax) &&
    Number.isInteger(highMax) &&
    lowMax >= 1 &&
    lowMax < mediumMax &&
    mediumMax < highMax &&
    highMax <= 25
  );
}

export function isValidProbabilityOrImpact(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

// Exposure = probabilidade × impacto (§32). Persistido para agregação, mas
// sempre DERIVADO pelo motor antes de gravar (mesma regra do critical no CPM).
export function riskExposure(probability: number, impact: number): number {
  return probability * impact;
}

export function riskLevel(
  exposure: number,
  matrix: RiskMatrixSpec = DEFAULT_RISK_MATRIX
): RiskLevel {
  if (exposure <= matrix.lowMax) return "LOW";
  if (exposure <= matrix.mediumMax) return "MEDIUM";
  if (exposure <= matrix.highMax) return "HIGH";
  return "CRITICAL";
}

export function residualRiskLevel(
  residualExposure: number | null,
  matrix: RiskMatrixSpec = DEFAULT_RISK_MATRIX
): RiskLevel | null {
  if (residualExposure === null) return null;
  return riskLevel(residualExposure, matrix);
}

// ---------------------------------------------------------------------------
// Máquina de estados do ciclo §32.
// ---------------------------------------------------------------------------

export const RISK_ACTIONS = [
  "ANALYZE",
  "PLAN",
  "IMPLEMENT",
  "MONITOR",
  "TREAT",
  "CLOSE",
  "CANCEL",
  "REOPEN",
] as const;

export type RiskAction = (typeof RISK_ACTIONS)[number];

export const RISK_TRANSITIONS: Record<RiskStatus, Partial<Record<RiskAction, RiskStatus>>> = {
  IDENTIFIED: { ANALYZE: "ANALYZED", CANCEL: "CANCELLED" },
  ANALYZED: { PLAN: "PLANNED", CANCEL: "CANCELLED" },
  PLANNED: { IMPLEMENT: "TREATING", PLAN: "PLANNED", CANCEL: "CANCELLED" },
  TREATING: { MONITOR: "MONITORING", CANCEL: "CANCELLED" },
  MONITORING: { CLOSE: "CLOSED", TREAT: "TREATING", CANCEL: "CANCELLED" },
  CLOSED: { REOPEN: "MONITORING" },
  CANCELLED: { REOPEN: "IDENTIFIED" },
};

export function nextRiskStatus(current: RiskStatus, action: RiskAction): RiskStatus | null {
  return RISK_TRANSITIONS[current]?.[action] ?? null;
}

export function availableRiskActions(current: RiskStatus): RiskAction[] {
  return Object.keys(RISK_TRANSITIONS[current] ?? {}) as RiskAction[];
}

export function isRiskTerminal(status: RiskStatus): boolean {
  return status === "CLOSED" || status === "CANCELLED";
}

export function isRiskOpen(status: RiskStatus): boolean {
  return !isRiskTerminal(status);
}
