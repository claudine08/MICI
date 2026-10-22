// Motor de campo (E12, §38/§26): diário de obra, tarefa de campo e
// restrição — constantes, rótulos e máquinas de estados puras. Sem I/O.
// Mobile-first (§38): poucos estados, ações explícitas e baratas.

// ---------------------------------------------------------------------------
// Diário de obra (§26)
// ---------------------------------------------------------------------------

export const DIARY_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
] as const;

export type DiaryStatus = (typeof DIARY_STATUSES)[number];

export const DIARY_STATUS_LABELS_PT: Record<DiaryStatus, string> = {
  DRAFT: "Rascunho",
  SUBMITTED: "Enviado",
  APPROVED: "Aprovado",
  REJECTED: "Rejeitado",
  CANCELLED: "Cancelado",
};

export const DIARY_ACTIONS = [
  "SUBMIT",
  "APPROVE",
  "REJECT",
  "REVISE",
  "CANCEL",
  "REOPEN",
] as const;

export type DiaryAction = (typeof DIARY_ACTIONS)[number];

export const DIARY_ACTION_LABELS_PT: Record<DiaryAction, string> = {
  SUBMIT: "Enviar",
  APPROVE: "Aprovar",
  REJECT: "Rejeitar",
  REVISE: "Revisar",
  CANCEL: "Cancelar",
  REOPEN: "Reabrir",
};

export const DIARY_TRANSITIONS: Record<DiaryStatus, Partial<Record<DiaryAction, DiaryStatus>>> = {
  DRAFT: { SUBMIT: "SUBMITTED", CANCEL: "CANCELLED" },
  SUBMITTED: { APPROVE: "APPROVED", REJECT: "REJECTED" },
  REJECTED: { REVISE: "DRAFT", CANCEL: "CANCELLED" },
  APPROVED: {},
  CANCELLED: { REOPEN: "DRAFT" },
};

export function nextDiaryStatus(current: DiaryStatus, action: DiaryAction): DiaryStatus | null {
  return DIARY_TRANSITIONS[current]?.[action] ?? null;
}

export function availableDiaryActions(current: DiaryStatus): DiaryAction[] {
  return Object.keys(DIARY_TRANSITIONS[current] ?? {}) as DiaryAction[];
}

// Aprovado/cancelado são registro histórico do campo — editam-se reabrindo.
export function isDiaryTerminal(status: DiaryStatus): boolean {
  return status === "APPROVED" || status === "CANCELLED";
}

export function isDiaryEditable(status: DiaryStatus): boolean {
  return status === "DRAFT" || status === "REJECTED";
}

// ------------------------------------------------------------------
// Tarefa de campo (E12-US03)
// ---------------------------------------------------------------------------

export const TASK_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "BLOCKED",
  "DONE",
  "CANCELLED",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS_PT: Record<TaskStatus, string> = {
  OPEN: "Aberta",
  IN_PROGRESS: "Em execução",
  BLOCKED: "Bloqueada",
  DONE: "Concluída",
  CANCELLED: "Cancelada",
};

export const TASK_ACTIONS = [
  "START",
  "BLOCK",
  "UNBLOCK",
  "COMPLETE",
  "CANCEL",
  "REOPEN",
] as const;

export type TaskAction = (typeof TASK_ACTIONS)[number];

export const TASK_ACTION_LABELS_PT: Record<TaskAction, string> = {
  START: "Iniciar",
  BLOCK: "Bloquear",
  UNBLOCK: "Desbloquear",
  COMPLETE: "Concluir",
  CANCEL: "Cancelar",
  REOPEN: "Reabrir",
};

export const TASK_TRANSITIONS: Record<TaskStatus, Partial<Record<TaskAction, TaskStatus>>> = {
  OPEN: { START: "IN_PROGRESS", CANCEL: "CANCELLED" },
  IN_PROGRESS: { BLOCK: "BLOCKED", COMPLETE: "DONE", CANCEL: "CANCELLED" },
  BLOCKED: { UNBLOCK: "IN_PROGRESS", CANCEL: "CANCELLED" },
  DONE: { REOPEN: "OPEN" },
  CANCELLED: { REOPEN: "OPEN" },
};

export function nextTaskStatus(current: TaskStatus, action: TaskAction): TaskStatus | null {
  return TASK_TRANSITIONS[current]?.[action] ?? null;
}

export function availableTaskActions(current: TaskStatus): TaskAction[] {
  return Object.keys(TASK_TRANSITIONS[current] ?? {}) as TaskAction[];
}

export function isTaskTerminal(status: TaskStatus): boolean {
  return status === "DONE" || status === "CANCELLED";
}

export function isTaskEditable(status: TaskStatus): boolean {
  return !isTaskTerminal(status);
}

// ---------------------------------------------------------------------------
// Restrição (E12-US05, §39)
// ---------------------------------------------------------------------------

export const CONSTRAINT_STATUSES = [
  "OPEN",
  "ADDRESSED",
  "REMOVED",
  "CANCELLED",
] as const;

export type ConstraintStatus = (typeof CONSTRAINT_STATUSES)[number];

export const CONSTRAINT_STATUS_LABELS_PT: Record<ConstraintStatus, string> = {
  OPEN: "Identificada",
  ADDRESSED: "Em tratamento",
  REMOVED: "Removida",
  CANCELLED: "Cancelada",
};

export const CONSTRAINT_ACTIONS = [
  "ADDRESS",
  "REMOVE",
  "CANCEL",
  "REOPEN",
] as const;

export type ConstraintAction = (typeof CONSTRAINT_ACTIONS)[number];

export const CONSTRAINT_ACTION_LABELS_PT: Record<ConstraintAction, string> = {
  ADDRESS: "Tratar",
  REMOVE: "Remover",
  CANCEL: "Cancelar",
  REOPEN: "Reabrir",
};

// §39: Constraint Identification → Constraint Removal.
export const CONSTRAINT_TRANSITIONS: Record<
  ConstraintStatus,
  Partial<Record<ConstraintAction, ConstraintStatus>>
> = {
  OPEN: { ADDRESS: "ADDRESSED", CANCEL: "CANCELLED" },
  ADDRESSED: { REMOVE: "REMOVED", CANCEL: "CANCELLED" },
  REMOVED: { REOPEN: "ADDRESSED" },
  CANCELLED: { REOPEN: "OPEN" },
};

export function nextConstraintStatus(
  current: ConstraintStatus,
  action: ConstraintAction
): ConstraintStatus | null {
  return CONSTRAINT_TRANSITIONS[current]?.[action] ?? null;
}

export function availableConstraintActions(current: ConstraintStatus): ConstraintAction[] {
  return Object.keys(CONSTRAINT_TRANSITIONS[current] ?? {}) as ConstraintAction[];
}

export function isConstraintTerminal(status: ConstraintStatus): boolean {
  return status === "REMOVED" || status === "CANCELLED";
}

export function isConstraintEditable(status: ConstraintStatus): boolean {
  return status === "OPEN" || status === "ADDRESSED";
}

// ---------------------------------------------------------------------------
// Prioridade compartilhada (tarefa + restrição)
// ---------------------------------------------------------------------------

export const FIELD_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export type FieldPriority = (typeof FIELD_PRIORITIES)[number];

export const FIELD_PRIORITY_LABELS_PT: Record<FieldPriority, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

export const CONSTRAINT_TYPES = [
  "SCOPE",
  "SCHEDULE",
  "COST",
  "RESOURCE",
  "TECHNICAL",
  "EXTERNAL",
  "REGULATORY",
  "SAFETY",
] as const;

export type ConstraintType = (typeof CONSTRAINT_TYPES)[number];

export const CONSTRAINT_TYPE_LABELS_PT: Record<ConstraintType, string> = {
  SCOPE: "Escopo",
  SCHEDULE: "Prazo",
  COST: "Custo",
  RESOURCE: "Recurso",
  TECHNICAL: "Técnica",
  EXTERNAL: "Externa",
  REGULATORY: "Regulatória",
  SAFETY: "Segurança",
};

// ---------------------------------------------------------------------------
// Regras de negócio puras
// ---------------------------------------------------------------------------

// BR-006: percentual financeiro não define avanço físico. Aqui apenas
// validamos a faixa usada pelos registros de campo (0–100).
export function isValidProgressPercent(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

// Diário por projeto é único na data (§26): um diário por dia de obra.
export function isSameDiaryDate(a: string, b: string): boolean {
  return a === b;
}

// Tarefa atrasada: tem prazo e não foi concluída/cancelada.
export function isTaskOverdue(
  status: TaskStatus,
  dueDate: string | null,
  today: string
): boolean {
  if (status === "DONE" || status === "CANCELLED") return false;
  if (!dueDate) return false;
  return dueDate < today;
}

// Restrição atrasada: tem prazo e ainda não foi removida/cancelada.
export function isConstraintOverdue(
  status: ConstraintStatus,
  dueDate: string | null,
  today: string
): boolean {
  if (status === "REMOVED" || status === "CANCELLED") return false;
  if (!dueDate) return false;
  return dueDate < today;
}

// Home de campo (§38): blocos do resumo do dia — Hoje / Esta semana /
// Atrasadas / Restrições. Função pura sobre as linhas já filtradas.
export interface FieldBoardCounts {
  today: number;
  thisWeek: number;
  overdue: number;
  openConstraints: number;
}

export function summarizeFieldBoard(input: {
  diaryEntries: { entryDate: string }[];
  tasks: { status: TaskStatus; dueDate: string | null }[];
  constraints: { status: ConstraintStatus }[];
  today: string;
  weekEnd: string;
}): FieldBoardCounts {
  return {
    today: input.diaryEntries.filter((d) => d.entryDate === input.today).length,
    thisWeek: input.diaryEntries.filter(
      (d) => d.entryDate >= input.today && d.entryDate <= input.weekEnd
    ).length,
    overdue: input.tasks.filter((t) => isTaskOverdue(t.status, t.dueDate, input.today)).length,
    openConstraints: input.constraints.filter(
      (c) => c.status === "OPEN" || c.status === "ADDRESSED"
    ).length,
  };
}
