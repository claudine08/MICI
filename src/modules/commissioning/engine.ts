// Motor de comissionamento (E15): máquinas de estados puras para plano,
// item de teste/reteste e aceite. Sem I/O.

// ---------------------------------------------------------------------------
// Plano de comissionamento
// ---------------------------------------------------------------------------
export const COMMISSIONING_PLAN_STATUSES = ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"] as const;
export type CommissioningPlanStatus = (typeof COMMISSIONING_PLAN_STATUSES)[number];

export const COMMISSIONING_PLAN_STATUS_LABELS_PT: Record<CommissioningPlanStatus, string> = {
  DRAFT: "Rascunho",
  ACTIVE: "Ativo",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
};

export const COMMISSIONING_PLAN_ACTIONS = ["ACTIVATE", "COMPLETE", "CANCEL", "REOPEN"] as const;
export type CommissioningPlanAction = (typeof COMMISSIONING_PLAN_ACTIONS)[number];

export const COMMISSIONING_PLAN_ACTION_LABELS_PT: Record<CommissioningPlanAction, string> = {
  ACTIVATE: "Ativar",
  COMPLETE: "Concluir",
  CANCEL: "Cancelar",
  REOPEN: "Reabrir",
};

export const COMMISSIONING_PLAN_TRANSITIONS: Record<
  CommissioningPlanStatus,
  Partial<Record<CommissioningPlanAction, CommissioningPlanStatus>>
> = {
  DRAFT: { ACTIVATE: "ACTIVE", CANCEL: "CANCELLED" },
  ACTIVE: { COMPLETE: "COMPLETED", CANCEL: "CANCELLED" },
  COMPLETED: { REOPEN: "ACTIVE" },
  CANCELLED: { REOPEN: "DRAFT" },
};

export function nextCommissioningPlanStatus(
  current: CommissioningPlanStatus,
  action: CommissioningPlanAction
): CommissioningPlanStatus | null {
  return COMMISSIONING_PLAN_TRANSITIONS[current]?.[action] ?? null;
}

export function availableCommissioningPlanActions(current: CommissioningPlanStatus): CommissioningPlanAction[] {
  return Object.keys(COMMISSIONING_PLAN_TRANSITIONS[current] ?? {}) as CommissioningPlanAction[];
}

export function isCommissioningPlanEditable(status: CommissioningPlanStatus): boolean {
  return status === "DRAFT" || status === "ACTIVE";
}

// ---------------------------------------------------------------------------
// Item de teste / reteste
// ---------------------------------------------------------------------------
export const COMMISSIONING_ITEM_STATUSES = [
  "PLANNED",
  "IN_PROGRESS",
  "PASSED",
  "FAILED",
  "RETESTING",
  "ACCEPTED",
] as const;
export type CommissioningItemStatus = (typeof COMMISSIONING_ITEM_STATUSES)[number];

export const COMMISSIONING_ITEM_STATUS_LABELS_PT: Record<CommissioningItemStatus, string> = {
  PLANNED: "Planejado",
  IN_PROGRESS: "Em teste",
  PASSED: "Aprovado",
  FAILED: "Reprovado",
  RETESTING: "Em reteste",
  ACCEPTED: "Aceito",
};

export const COMMISSIONING_ITEM_RESULTS = ["PASS", "FAIL", "NA"] as const;
export type CommissioningItemResult = (typeof COMMISSIONING_ITEM_RESULTS)[number];

export const COMMISSIONING_ITEM_RESULT_LABELS_PT: Record<CommissioningItemResult, string> = {
  PASS: "Conforme",
  FAIL: "Não conforme",
  NA: "Não aplicável",
};

export const COMMISSIONING_ITEM_ACTIONS = ["START", "PASS", "FAIL", "RETEST", "ACCEPT", "REOPEN"] as const;
export type CommissioningItemAction = (typeof COMMISSIONING_ITEM_ACTIONS)[number];

export const COMMISSIONING_ITEM_ACTION_LABELS_PT: Record<CommissioningItemAction, string> = {
  START: "Iniciar teste",
  PASS: "Aprovar",
  FAIL: "Reprovar",
  RETEST: "Retestar",
  ACCEPT: "Aceitar",
  REOPEN: "Reabrir",
};

export const COMMISSIONING_ITEM_TRANSITIONS: Record<
  CommissioningItemStatus,
  Partial<Record<CommissioningItemAction, CommissioningItemStatus>>
> = {
  PLANNED: { START: "IN_PROGRESS" },
  IN_PROGRESS: { PASS: "PASSED", FAIL: "FAILED" },
  PASSED: { ACCEPT: "ACCEPTED", REOPEN: "PLANNED" },
  FAILED: { RETEST: "RETESTING", REOPEN: "PLANNED" },
  RETESTING: { PASS: "PASSED", FAIL: "FAILED" },
  ACCEPTED: { REOPEN: "PLANNED" },
};

export function nextCommissioningItemStatus(
  current: CommissioningItemStatus,
  action: CommissioningItemAction
): CommissioningItemStatus | null {
  return COMMISSIONING_ITEM_TRANSITIONS[current]?.[action] ?? null;
}

export function availableCommissioningItemActions(current: CommissioningItemStatus): CommissioningItemAction[] {
  return Object.keys(COMMISSIONING_ITEM_TRANSITIONS[current] ?? {}) as CommissioningItemAction[];
}

export function isCommissioningItemEditable(status: CommissioningItemStatus): boolean {
  return status === "PLANNED" || status === "IN_PROGRESS" || status === "FAILED" || status === "RETESTING";
}

// ---------------------------------------------------------------------------
// Aceite formal
// ---------------------------------------------------------------------------
export const ACCEPTANCE_STATUSES = ["DRAFT", "APPROVED", "REJECTED"] as const;
export type AcceptanceStatus = (typeof ACCEPTANCE_STATUSES)[number];

export const ACCEPTANCE_STATUS_LABELS_PT: Record<AcceptanceStatus, string> = {
  DRAFT: "Rascunho",
  APPROVED: "Aprovado",
  REJECTED: "Rejeitado",
};

export const ACCEPTANCE_ACTIONS = ["APPROVE", "REJECT", "REOPEN"] as const;
export type AcceptanceAction = (typeof ACCEPTANCE_ACTIONS)[number];

export const ACCEPTANCE_ACTION_LABELS_PT: Record<AcceptanceAction, string> = {
  APPROVE: "Aprovar",
  REJECT: "Rejeitar",
  REOPEN: "Reabrir",
};

export const ACCEPTANCE_TRANSITIONS: Record<
  AcceptanceStatus,
  Partial<Record<AcceptanceAction, AcceptanceStatus>>
> = {
  DRAFT: { APPROVE: "APPROVED", REJECT: "REJECTED" },
  APPROVED: { REOPEN: "DRAFT" },
  REJECTED: { REOPEN: "DRAFT" },
};

export function nextAcceptanceStatus(current: AcceptanceStatus, action: AcceptanceAction): AcceptanceStatus | null {
  return ACCEPTANCE_TRANSITIONS[current]?.[action] ?? null;
}

export function availableAcceptanceActions(current: AcceptanceStatus): AcceptanceAction[] {
  return Object.keys(ACCEPTANCE_TRANSITIONS[current] ?? {}) as AcceptanceAction[];
}

export function isAcceptanceEditable(status: AcceptanceStatus): boolean {
  return status === "DRAFT";
}