export const SUSTAINABILITY_PLAN_STATUSES = ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"] as const;
export type SustainabilityPlanStatus = (typeof SUSTAINABILITY_PLAN_STATUSES)[number];

export const SUSTAINABILITY_PLAN_STATUS_LABELS_PT: Record<SustainabilityPlanStatus, string> = {
  DRAFT: "Rascunho",
  ACTIVE: "Ativo",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
};

export const SUSTAINABILITY_PLAN_ACTIONS = ["ACTIVATE", "COMPLETE", "CANCEL", "REOPEN"] as const;
export type SustainabilityPlanAction = (typeof SUSTAINABILITY_PLAN_ACTIONS)[number];

export const SUSTAINABILITY_PLAN_TRANSITIONS: Record<
  SustainabilityPlanStatus,
  Partial<Record<SustainabilityPlanAction, SustainabilityPlanStatus>>
> = {
  DRAFT: { ACTIVATE: "ACTIVE", CANCEL: "CANCELLED" },
  ACTIVE: { COMPLETE: "COMPLETED", CANCEL: "CANCELLED" },
  COMPLETED: { REOPEN: "ACTIVE" },
  CANCELLED: { REOPEN: "DRAFT" },
};

export function nextSustainabilityPlanStatus(
  current: SustainabilityPlanStatus,
  action: SustainabilityPlanAction
): SustainabilityPlanStatus | null {
  return SUSTAINABILITY_PLAN_TRANSITIONS[current]?.[action] ?? null;
}

export function availableSustainabilityPlanActions(current: SustainabilityPlanStatus): SustainabilityPlanAction[] {
  return Object.keys(SUSTAINABILITY_PLAN_TRANSITIONS[current] ?? {}) as SustainabilityPlanAction[];
}

export function isSustainabilityPlanEditable(status: SustainabilityPlanStatus): boolean {
  return status === "DRAFT" || status === "ACTIVE";
}