// Motor de qualidade (E13, §33/§34): checklist (modelo + execução) e
// inspeção — constantes, rótulos e máquinas de estados puras. Sem I/O.
// Fluxo da spec: Planned → Executed → Passed / Failed → Corrective Action →
// Verification → Closed. NCR e ação corretiva entram na Fatia 2.

// ---------------------------------------------------------------------------
// Itens de checklist (modelo e execução compartilham a forma)
// ---------------------------------------------------------------------------

export const CHECKLIST_ITEM_RESULTS = ["PASS", "FAIL", "NA"] as const;

export type ChecklistItemResult = (typeof CHECKLIST_ITEM_RESULTS)[number];

export const CHECKLIST_ITEM_RESULT_LABELS_PT: Record<ChecklistItemResult, string> = {
  PASS: "Conforme",
  FAIL: "Não conforme",
  NA: "Não aplicável",
};

export interface ChecklistItem {
  key: string;
  text: string;
  required: boolean;
  result?: ChecklistItemResult | null;
  note?: string | null;
}

export function parseChecklistItems(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is ChecklistItem =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as ChecklistItem).key === "string" &&
      typeof (item as ChecklistItem).text === "string"
  );
}

export interface ChecklistSummary {
  total: number;
  required: number;
  answered: number;
  requiredAnswered: number;
  passed: number;
  failed: number;
  notApplicable: number;
  pending: number;
  complete: boolean;
  hasFailure: boolean;
}

// Resumo puro dos itens — usado pela UI e pela regra de conclusão (§33:
// item só conclui quando responde ao critério).
export function summarizeChecklistItems(items: ChecklistItem[]): ChecklistSummary {
  const required = items.filter((item) => item.required);
  const answered = items.filter((item) => Boolean(item.result));
  const requiredAnswered = required.filter((item) => Boolean(item.result));
  const failed = items.filter((item) => item.result === "FAIL");

  return {
    total: items.length,
    required: required.length,
    answered: answered.length,
    requiredAnswered: requiredAnswered.length,
    passed: items.filter((item) => item.result === "PASS").length,
    failed: failed.length,
    notApplicable: items.filter((item) => item.result === "NA").length,
    pending: items.length - answered.length,
    complete: items.length > 0 && requiredAnswered.length === required.length,
    hasFailure: failed.length > 0,
  };
}

// Modelos sem item não podem ser usados (E13-US01).
export function isValidTemplateItems(items: ChecklistItem[]): boolean {
  return items.length > 0 && items.every((item) => item.text.trim().length > 0);
}

// ---------------------------------------------------------------------------
// Execução de checklist (E13-US01)
// ---------------------------------------------------------------------------

export const CHECKLIST_EXECUTION_STATUSES = ["DRAFT", "COMPLETED", "CANCELLED"] as const;

export type ChecklistExecutionStatus = (typeof CHECKLIST_EXECUTION_STATUSES)[number];

export const CHECKLIST_EXECUTION_STATUS_LABELS_PT: Record<ChecklistExecutionStatus, string> = {
  DRAFT: "Em preenchimento",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};

export const CHECKLIST_EXECUTION_ACTIONS = ["COMPLETE", "REOPEN", "CANCEL"] as const;

export type ChecklistExecutionAction = (typeof CHECKLIST_EXECUTION_ACTIONS)[number];

export const CHECKLIST_EXECUTION_ACTION_LABELS_PT: Record<ChecklistExecutionAction, string> = {
  COMPLETE: "Concluir",
  REOPEN: "Reabrir",
  CANCEL: "Cancelar",
};

export const CHECKLIST_EXECUTION_TRANSITIONS: Record<
  ChecklistExecutionStatus,
  Partial<Record<ChecklistExecutionAction, ChecklistExecutionStatus>>
> = {
  DRAFT: { COMPLETE: "COMPLETED", CANCEL: "CANCELLED" },
  COMPLETED: { REOPEN: "DRAFT" },
  CANCELLED: { REOPEN: "DRAFT" },
};

export function nextChecklistExecutionStatus(
  current: ChecklistExecutionStatus,
  action: ChecklistExecutionAction
): ChecklistExecutionStatus | null {
  return CHECKLIST_EXECUTION_TRANSITIONS[current]?.[action] ?? null;
}

export function availableChecklistExecutionActions(
  current: ChecklistExecutionStatus
): ChecklistExecutionAction[] {
  return Object.keys(CHECKLIST_EXECUTION_TRANSITIONS[current] ?? {}) as ChecklistExecutionAction[];
}

export function isChecklistExecutionEditable(status: ChecklistExecutionStatus): boolean {
  return status === "DRAFT";
}

export function isChecklistExecutionTerminal(status: ChecklistExecutionStatus): boolean {
  return status === "COMPLETED" || status === "CANCELLED";
}

// ---------------------------------------------------------------------------
// Inspeção (E13-US02, §33)
// ---------------------------------------------------------------------------

export const INSPECTION_STATUSES = [
  "PLANNED",
  "EXECUTED",
  "PASSED",
  "FAILED",
  "CLOSED",
  "CANCELLED",
] as const;

export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

export const INSPECTION_STATUS_LABELS_PT: Record<InspectionStatus, string> = {
  PLANNED: "Planejada",
  EXECUTED: "Executada",
  PASSED: "Aprovada",
  FAILED: "Reprovada",
  CLOSED: "Encerrada",
  CANCELLED: "Cancelada",
};

export const INSPECTION_ACTIONS = ["EXECUTE", "PASS", "FAIL", "CLOSE", "REOPEN", "CANCEL"] as const;

export type InspectionAction = (typeof INSPECTION_ACTIONS)[number];

export const INSPECTION_ACTION_LABELS_PT: Record<InspectionAction, string> = {
  EXECUTE: "Executar",
  PASS: "Aprovar",
  FAIL: "Reprovar",
  CLOSE: "Encerrar",
  REOPEN: "Reabrir",
  CANCEL: "Cancelar",
};

// §33: Planned → Executed → Passed / Failed → (Corrective Action →
// Verification) → Closed. Em FAILED a Fatia 2 passa a exigir NCR aberto/
// encerrado antes do CLOSE.
export const INSPECTION_TRANSITIONS: Record<
  InspectionStatus,
  Partial<Record<InspectionAction, InspectionStatus>>
> = {
  PLANNED: { EXECUTE: "EXECUTED", CANCEL: "CANCELLED" },
  EXECUTED: { PASS: "PASSED", FAIL: "FAILED", CANCEL: "CANCELLED" },
  PASSED: { CLOSE: "CLOSED", REOPEN: "EXECUTED" },
  FAILED: { CLOSE: "CLOSED", REOPEN: "EXECUTED" },
  CLOSED: {},
  CANCELLED: { REOPEN: "PLANNED" },
};

export function nextInspectionStatus(
  current: InspectionStatus,
  action: InspectionAction
): InspectionStatus | null {
  return INSPECTION_TRANSITIONS[current]?.[action] ?? null;
}

export function availableInspectionActions(current: InspectionStatus): InspectionAction[] {
  return Object.keys(INSPECTION_TRANSITIONS[current] ?? {}) as InspectionAction[];
}

// Planejada/executada ainda são rascunho operacional — depois disso o
// resultado é registro histórico (edita-se reabrindo).
export function isInspectionEditable(status: InspectionStatus): boolean {
  return status === "PLANNED" || status === "EXECUTED";
}

export function isInspectionTerminal(status: InspectionStatus): boolean {
  return status === "CLOSED" || status === "CANCELLED";
}

export function isInspectionOpen(status: InspectionStatus): boolean {
  return status !== "CLOSED" && status !== "CANCELLED";
}

// §33 "item somente concluído quando atingir o critério e possuir EVIDÊNCIA
// adequada": sair de EXECUTED exige prova material — foto de evidência ou
// execução de checklist concluída vinculada à inspeção.
export function inspectionHasEvidence(input: {
  photoCount: number;
  completedChecklists: number;
}): boolean {
  return input.photoCount > 0 || input.completedChecklists > 0;
}

// ---------------------------------------------------------------------------
// Não conformidade — NCR (E13-US03, §33)
// ---------------------------------------------------------------------------

// Nascido de inspeção reprovada (FAIL). Fluxo da spec: Failed → Corrective
// Action → Verification → Closed. O NCR gateia o encerramento da inspeção.
export const NON_CONFORMITY_STATUSES = [
  "OPEN",
  "CORRECTION",
  "VERIFICATION",
  "CLOSED",
  "CANCELLED",
] as const;

export type NonConformityStatus = (typeof NON_CONFORMITY_STATUSES)[number];

export const NON_CONFORMITY_STATUS_LABELS_PT: Record<NonConformityStatus, string> = {
  OPEN: "Aberta",
  CORRECTION: "Em correção",
  VERIFICATION: "Em verificação",
  CLOSED: "Encerrada",
  CANCELLED: "Cancelada",
};

export const NON_CONFORMITY_ACTIONS = [
  "START",
  "SUBMIT",
  "VERIFY",
  "REJECT",
  "CANCEL",
  "REOPEN",
] as const;

export type NonConformityAction = (typeof NON_CONFORMITY_ACTIONS)[number];

export const NON_CONFORMITY_ACTION_LABELS_PT: Record<NonConformityAction, string> = {
  START: "Iniciar correção",
  SUBMIT: "Enviar para verificação",
  VERIFY: "Verificar (efetiva)",
  REJECT: "Reprovar verificação",
  CANCEL: "Cancelar",
  REOPEN: "Reabrir",
};

export const NON_CONFORMITY_TRANSITIONS: Record<
  NonConformityStatus,
  Partial<Record<NonConformityAction, NonConformityStatus>>
> = {
  OPEN: { START: "CORRECTION", CANCEL: "CANCELLED" },
  CORRECTION: { SUBMIT: "VERIFICATION", CANCEL: "CANCELLED" },
  VERIFICATION: { VERIFY: "CLOSED", REJECT: "CORRECTION", CANCEL: "CANCELLED" },
  CLOSED: { REOPEN: "VERIFICATION" },
  CANCELLED: { REOPEN: "OPEN" },
};

export function nextNonConformityStatus(
  current: NonConformityStatus,
  action: NonConformityAction
): NonConformityStatus | null {
  return NON_CONFORMITY_TRANSITIONS[current]?.[action] ?? null;
}

export function availableNonConformityActions(
  current: NonConformityStatus
): NonConformityAction[] {
  return Object.keys(NON_CONFORMITY_TRANSITIONS[current] ?? {}) as NonConformityAction[];
}

export function isNonConformityEditable(status: NonConformityStatus): boolean {
  return status === "OPEN" || status === "CORRECTION";
}

export function isNonConformityOpen(status: NonConformityStatus): boolean {
  return status !== "CLOSED" && status !== "CANCELLED";
}

// Encerramento gateia a inspeção reprovada: só se considera "resolvida" um NCR
// que está CLOSED ou CANCELLED — ação corretiva pendente segura o CLOSE.
export function isNonConformityResolved(status: NonConformityStatus): boolean {
  return status === "CLOSED" || status === "CANCELLED";
}

// ---------------------------------------------------------------------------
// Ação corretiva (E13-US04)
// ---------------------------------------------------------------------------

export const CORRECTIVE_ACTION_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "DONE",
  "VERIFIED",
  "CLOSED",
  "CANCELLED",
] as const;

export type CorrectiveActionStatus = (typeof CORRECTIVE_ACTION_STATUSES)[number];

export const CORRECTIVE_ACTION_STATUS_LABELS_PT: Record<CorrectiveActionStatus, string> = {
  OPEN: "Aberta",
  IN_PROGRESS: "Em andamento",
  DONE: "Concluída",
  VERIFIED: "Verificada",
  CLOSED: "Encerrada",
  CANCELLED: "Cancelada",
};

export const CORRECTIVE_ACTION_ACTIONS = [
  "START",
  "COMPLETE",
  "VERIFY",
  "REJECT",
  "CLOSE",
  "CANCEL",
  "REOPEN",
] as const;

export type CorrectiveActionAction = (typeof CORRECTIVE_ACTION_ACTIONS)[number];

export const CORRECTIVE_ACTION_ACTION_LABELS_PT: Record<CorrectiveActionAction, string> = {
  START: "Iniciar",
  COMPLETE: "Concluir correção",
  VERIFY: "Verificar",
  REJECT: "Reprovar",
  CLOSE: "Encerrar",
  CANCEL: "Cancelar",
  REOPEN: "Reabrir",
};

export const CORRECTIVE_ACTION_TRANSITIONS: Record<
  CorrectiveActionStatus,
  Partial<Record<CorrectiveActionAction, CorrectiveActionStatus>>
> = {
  OPEN: { START: "IN_PROGRESS", CANCEL: "CANCELLED" },
  IN_PROGRESS: { COMPLETE: "DONE", CANCEL: "CANCELLED" },
  DONE: { VERIFY: "VERIFIED", REJECT: "IN_PROGRESS" },
  VERIFIED: { CLOSE: "CLOSED", REJECT: "IN_PROGRESS" },
  CLOSED: { REOPEN: "VERIFIED" },
  CANCELLED: { REOPEN: "OPEN" },
};

export function nextCorrectiveActionStatus(
  current: CorrectiveActionStatus,
  action: CorrectiveActionAction
): CorrectiveActionStatus | null {
  return CORRECTIVE_ACTION_TRANSITIONS[current]?.[action] ?? null;
}

export function availableCorrectiveActionActions(
  current: CorrectiveActionStatus
): CorrectiveActionAction[] {
  return Object.keys(CORRECTIVE_ACTION_TRANSITIONS[current] ?? {}) as CorrectiveActionAction[];
}

export function isCorrectiveActionEditable(status: CorrectiveActionStatus): boolean {
  return status === "OPEN" || status === "IN_PROGRESS";
}

export function isCorrectiveActionOpen(status: CorrectiveActionStatus): boolean {
  return status !== "CLOSED" && status !== "CANCELLED";
}

// ---------------------------------------------------------------------------
// Resumo do quadro de qualidade (página portfólio e home do projeto)
// ---------------------------------------------------------------------------

export interface QualityBoardCounts {
  templates: number;
  executions: number;
  executionsPending: number;
  inspections: number;
  planned: number;
  executed: number;
  passed: number;
  failed: number;
  closed: number;
  open: number;
  nonConformities: number;
  nonConformitiesOpen: number;
  correctiveActions: number;
  correctiveActionsOpen: number;
}

export function summarizeQualityBoard(input: {
  templates: { id: string }[];
  executions: { status: ChecklistExecutionStatus }[];
  inspections: { status: InspectionStatus }[];
  nonConformities?: { status: NonConformityStatus }[];
  correctiveActions?: { status: CorrectiveActionStatus }[];
}): QualityBoardCounts {
  const byStatus = (status: InspectionStatus) =>
    input.inspections.filter((inspection) => inspection.status === status).length;
  const ncrs = input.nonConformities ?? [];
  const actions = input.correctiveActions ?? [];

  return {
    templates: input.templates.length,
    executions: input.executions.length,
    executionsPending: input.executions.filter((execution) => execution.status === "DRAFT")
      .length,
    inspections: input.inspections.length,
    planned: byStatus("PLANNED"),
    executed: byStatus("EXECUTED"),
    passed: byStatus("PASSED"),
    failed: byStatus("FAILED"),
    closed: byStatus("CLOSED"),
    open: input.inspections.filter((inspection) => isInspectionOpen(inspection.status)).length,
    nonConformities: ncrs.length,
    nonConformitiesOpen: ncrs.filter((ncr) => isNonConformityOpen(ncr.status)).length,
    correctiveActions: actions.length,
    correctiveActionsOpen: actions.filter((action) => isCorrectiveActionOpen(action.status))
      .length,
  };
}
