// Motor puro de gates e fases (§17, E06, BR-001/BR-002).
// Funções sem I/O — testáveis em unit tests; serviços orquestram Prisma/auditoria.

// ---------------------------------------------------------------------------
// Fases do ciclo de vida (§9 F0–F10)
// ---------------------------------------------------------------------------

export const PROJECT_PHASES = [
  { code: "F0", name: "Oportunidade" },
  { code: "F1", name: "Descoberta e Requisitos" },
  { code: "F2", name: "Viabilidade e Concepção" },
  { code: "F3", name: "Orçamentação" },
  { code: "F4", name: "Contratação e Mobilização" },
  { code: "F5", name: "Projeto Executivo" },
  { code: "F6", name: "Suprimentos" },
  { code: "F7", name: "Execução" },
  { code: "F8", name: "Entrega" },
  { code: "F9", name: "Encerramento" },
  { code: "F10", name: "Pós-ocupação / Garantia" },
] as const;

export type PhaseCode = (typeof PROJECT_PHASES)[number]["code"];

export function isValidPhase(code: string): boolean {
  return PROJECT_PHASES.some((phase) => phase.code === code);
}

export function phaseIndex(code: string): number {
  return PROJECT_PHASES.findIndex((phase) => phase.code === code);
}

export function nextPhase(code: string): string | null {
  const index = phaseIndex(code);
  if (index < 0 || index >= PROJECT_PHASES.length - 1) return null;
  return PROJECT_PHASES[index + 1].code;
}

export function prevPhase(code: string): string | null {
  const index = phaseIndex(code);
  if (index <= 0) return null;
  return PROJECT_PHASES[index - 1].code;
}

// ---------------------------------------------------------------------------
// Máquina de estados do gate (§16.3 — sem PATCH arbitrário de status)
// ---------------------------------------------------------------------------

export const GATE_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "WAIVED",
] as const;

export type GateStatusValue = (typeof GATE_STATUSES)[number];

export const GATE_ACTIONS = [
  "start",
  "submit",
  "analyze",
  "approve",
  "reject",
  "waive",
] as const;

export type GateAction = (typeof GATE_ACTIONS)[number];

const GATE_TRANSITIONS: Record<
  GateAction,
  { from: GateStatusValue[]; to: GateStatusValue }
> = {
  start: { from: ["NOT_STARTED"], to: "IN_PROGRESS" },
  submit: { from: ["IN_PROGRESS"], to: "SUBMITTED" },
  analyze: { from: ["SUBMITTED"], to: "UNDER_REVIEW" },
  approve: { from: ["UNDER_REVIEW"], to: "APPROVED" },
  reject: { from: ["UNDER_REVIEW"], to: "REJECTED" },
  waive: {
    from: ["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "UNDER_REVIEW", "REJECTED"],
    to: "WAIVED",
  },
};

export function isGateAction(value: string): value is GateAction {
  return (GATE_ACTIONS as readonly string[]).includes(value);
}

// Retorna o status destino ou null se a transição não é permitida.
export function gateTransition(
  action: GateAction,
  current: GateStatusValue
): GateStatusValue | null {
  const rule = GATE_TRANSITIONS[action];
  if (!rule) return null;
  return rule.from.includes(current) ? rule.to : null;
}

export function actionsForStatus(current: GateStatusValue): GateAction[] {
  return GATE_ACTIONS.filter((action) => gateTransition(action, current) !== null);
}

// ---------------------------------------------------------------------------
// Snapshot de critérios (§15.1)
// ---------------------------------------------------------------------------

export interface CriterionSnapshot {
  code: string;
  description: string;
  required: boolean;
  orderIndex: number;
}

// ---------------------------------------------------------------------------
// BR-002 / E06-US05 — checagens de aprovação
// ---------------------------------------------------------------------------

export interface ApproveGateCheck {
  snapshot: CriterionSnapshot[];
  completedCodes: ReadonlySet<string>;
  evidenceCount: number;
  requiresEvidence: boolean;
}

export interface ApproveBlock {
  code: "GATE_CRITERIA_PENDING" | "GATE_EVIDENCE_REQUIRED";
  message: string;
  pendingCriteria?: string[];
}

export function approveBlocks(check: ApproveGateCheck): ApproveBlock[] {
  const blocks: ApproveBlock[] = [];

  const pending = check.snapshot
    .filter(
      (criterion) => criterion.required && !check.completedCodes.has(criterion.code)
    )
    .map((criterion) => criterion.code);

  if (pending.length > 0) {
    blocks.push({
      code: "GATE_CRITERIA_PENDING",
      message: `Aprovação bloqueada: ${pending.length} critério(s) obrigatório(s) pendente(s).`,
      pendingCriteria: pending,
    });
  }

  if (check.requiresEvidence && check.evidenceCount === 0) {
    blocks.push({
      code: "GATE_EVIDENCE_REQUIRED",
      message: "Aprovação bloqueada (BR-002): evidência obrigatória ausente.",
    });
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// BR-001 — avanço de fase exige gate obrigatório aprovado/dispensado
// ---------------------------------------------------------------------------

export interface BlockingGateStatus {
  code: string;
  name: string;
  status: string;
}

const GATE_RELEASED_STATUSES = new Set(["APPROVED", "WAIVED"]);

export function pendingBlockingGates(
  gates: BlockingGateStatus[]
): BlockingGateStatus[] {
  return gates.filter((gate) => !GATE_RELEASED_STATUSES.has(gate.status));
}
