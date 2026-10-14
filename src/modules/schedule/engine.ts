import { AppError } from "@/core/errors";

// Motor de caminho crítico (E07-US06, §27) — funções puras, sem I/O.
// Datas em "epoch days" (dias UTC inteiros) para evitar fuso; duração e lag
// em DIA ÚTIL, contagem inclusiva: atividade de duração d que inicia em s
// termina em s + (d-1) dias úteis; duração 0 = marco (início = fim).

export type DependencyTypeValue = "FS" | "SS" | "FF" | "SF";

export interface CalendarSpec {
  /** Dias úteis da semana: 0=domingo … 6=sábado. */
  workingWeek: number[];
  /** Feriados em AAAA-MM-DD. */
  holidays: string[];
}

export const DEFAULT_CALENDAR: CalendarSpec = {
  workingWeek: [1, 2, 3, 4, 5],
  holidays: [],
};

export interface CpmActivity {
  id: string;
  code?: string;
  duration: number;
  calendarKey?: string | null;
}

export interface CpmDependency {
  predecessorId: string;
  successorId: string;
  type: DependencyTypeValue;
  lag: number;
}

export interface CpmOptions {
  /** Início do projeto em epoch day (UTC). */
  projectStart: number;
  /** Calendários por chave (id do ProjectCalendar). */
  calendars?: Record<string, CalendarSpec>;
  defaultCalendar?: CalendarSpec;
}

export interface CpmNode {
  id: string;
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  totalFloat: number;
  critical: boolean;
}

export interface CpmResult {
  nodes: Map<string, CpmNode>;
  projectFinish: number;
}

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;
const MAX_STEPS = 36_600; // ~100 anos de dias — guarda contra calendário inválido

export function dateToDay(value: Date | string): number {
  if (typeof value === "string") {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day) / MS_PER_DAY;
  }
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()) / MS_PER_DAY;
}

export function dayToDate(day: number): Date {
  return new Date(day * MS_PER_DAY);
}

export function dayToIso(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

type DayGuard = (day: number) => boolean;

function compileCalendar(spec: CalendarSpec): DayGuard {
  const week = new Set(spec.workingWeek);
  const holidays = new Set(spec.holidays);
  return (day: number) => {
    const weekday = (((day + 4) % 7) + 7) % 7; // epoch 0 = 1970-01-01 (quinta)
    if (!week.has(weekday)) return false;
    return !holidays.has(dayToIso(day));
  };
}

function toWorkingDay(day: number, isWorking: DayGuard): number {
  let current = day;
  for (let steps = 0; steps < MAX_STEPS; steps += 1) {
    if (isWorking(current)) return current;
    current += 1;
  }
  throw new AppError("VALIDATION_ERROR", "Calendário sem dias úteis.");
}

/** Avança (ou retrocede, com n negativo) n dias úteis a partir de `from`. */
function advanceWorking(from: number, n: number, isWorking: DayGuard): number {
  if (n === 0) return from;
  const direction = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  let day = from;
  for (let steps = 0; steps < MAX_STEPS; steps += 1) {
    day += direction;
    if (isWorking(day)) {
      remaining -= 1;
      if (remaining === 0) return day;
    }
  }
  throw new AppError("VALIDATION_ERROR", "Calendário sem dias úteis suficientes.");
}

/** Fim inclusivo: duração ≤ 0 ⇒ mesmo dia; senão avança d-1 dias úteis. */
function finishOf(start: number, duration: number, isWorking: DayGuard): number {
  if (duration <= 0) return start;
  return advanceWorking(start, duration - 1, isWorking);
}

/** Início a partir do fim inclusivo (inverso de finishOf). */
function startOf(finish: number, duration: number, isWorking: DayGuard): number {
  if (duration <= 0) return finish;
  return advanceWorking(finish, -(duration - 1), isWorking);
}

/** Dias úteis assinados de `from` até `to` (float = ls - es em dias úteis). */
function workdayDiff(from: number, to: number, isWorking: DayGuard): number {
  if (from === to) return 0;
  const direction = to > from ? 1 : -1;
  let day = from;
  let count = 0;
  while (direction > 0 ? day < to : day > to) {
    day += direction;
    if (isWorking(day)) count += 1;
    if (count > MAX_STEPS) break;
  }
  return count * direction;
}

// ---------------------------------------------------------------------------
// Ordenação topológica + detecção de ciclo (§27)
// ---------------------------------------------------------------------------

function topologicalOrder(
  activities: CpmActivity[],
  dependencies: CpmDependency[]
): string[] {
  const ids = new Set(activities.map((activity) => activity.id));
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const id of ids) {
    outgoing.set(id, []);
    indegree.set(id, 0);
  }
  for (const dependency of dependencies) {
    if (!ids.has(dependency.predecessorId) || !ids.has(dependency.successorId)) {
      throw new AppError("VALIDATION_ERROR", "Dependência referencia atividade inexistente.", {
        details: { predecessorId: dependency.predecessorId, successorId: dependency.successorId },
      });
    }
    if (dependency.predecessorId === dependency.successorId) {
      throw new AppError("VALIDATION_ERROR", "Atividade não pode depender de si mesma.");
    }
    outgoing.get(dependency.predecessorId)!.push(dependency.successorId);
    indegree.set(dependency.successorId, (indegree.get(dependency.successorId) ?? 0) + 1);
  }

  const queue = [...ids].filter((id) => (indegree.get(id) ?? 0) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const degree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, degree);
      if (degree === 0) queue.push(next);
    }
  }

  if (order.length !== ids.size) {
    const stuck = activities.filter((activity) => !order.includes(activity.id));
    throw new AppError(
      "VALIDATION_ERROR",
      "Ciclo de dependências detectado no cronograma.",
      { details: { activities: stuck.map((activity) => activity.code ?? activity.id) } }
    );
  }
  return order;
}

// ---------------------------------------------------------------------------
// Forward/backward pass
// ---------------------------------------------------------------------------

export function computeCpm(
  activities: CpmActivity[],
  dependencies: CpmDependency[],
  options: CpmOptions
): CpmResult {
  const defaultCalendar = compileCalendar(options.defaultCalendar ?? DEFAULT_CALENDAR);
  const calendarCache = new Map<string, DayGuard>();
  const calendarOf = (activity: CpmActivity): DayGuard => {
    if (!activity.calendarKey) return defaultCalendar;
    const cached = calendarCache.get(activity.calendarKey);
    if (cached) return cached;
    const spec = options.calendars?.[activity.calendarKey];
    const guard = spec ? compileCalendar(spec) : defaultCalendar;
    calendarCache.set(activity.calendarKey, guard);
    return guard;
  };

  const byId = new Map(activities.map((activity) => [activity.id, activity]));
  // Valida existência/aciclicidade antes de montar as listas de adjacência.
  const order = topologicalOrder(activities, dependencies);

  const incoming = new Map<string, CpmDependency[]>();
  const outgoing = new Map<string, CpmDependency[]>();
  for (const activity of activities) {
    incoming.set(activity.id, []);
    outgoing.set(activity.id, []);
  }
  for (const dependency of dependencies) {
    incoming.get(dependency.successorId)!.push(dependency);
    outgoing.get(dependency.predecessorId)!.push(dependency);
  }

  // Forward pass — ES/EF mais cedo respeitando o clamp no início do projeto.
  const earlyStart = new Map<string, number>();
  const earlyFinish = new Map<string, number>();
  for (const id of order) {
    const activity = byId.get(id)!;
    const isWorking = calendarOf(activity);
    let earliest = toWorkingDay(options.projectStart, isWorking);
    for (const dependency of incoming.get(id)!) {
      const predEs = earlyStart.get(dependency.predecessorId)!;
      const predEf = earlyFinish.get(dependency.predecessorId)!;
      const lag = dependency.lag;
      let candidate: number;
      switch (dependency.type) {
        case "FS":
          candidate = advanceWorking(predEf, lag + 1, isWorking);
          break;
        case "SS":
          candidate = advanceWorking(predEs, lag, isWorking);
          break;
        case "FF":
          candidate = startOf(advanceWorking(predEf, lag, isWorking), activity.duration, isWorking);
          break;
        case "SF":
          candidate = startOf(advanceWorking(predEs, lag, isWorking), activity.duration, isWorking);
          break;
      }
      if (candidate > earliest) earliest = candidate;
    }
    const start = toWorkingDay(earliest, isWorking);
    earlyStart.set(id, start);
    earlyFinish.set(id, finishOf(start, activity.duration, isWorking));
  }

  const projectFinish = activities.length
    ? Math.max(...activities.map((activity) => earlyFinish.get(activity.id)!))
    : options.projectStart;

  // Backward pass — LF/LS mais tarde. Toda atividade é limitada pelo fim do
  // projeto: atrasá-la não pode estender o término (float = folga sem mover o fim).
  const lateStart = new Map<string, number>();
  const lateFinish = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const activity = byId.get(id)!;
    const isWorking = calendarOf(activity);
    const successors = outgoing.get(id)!;
    const deadline = toWorkingDay(projectFinish, isWorking);
    let finish: number;
    if (successors.length === 0) {
      finish = deadline;
    } else {
      finish = Number.POSITIVE_INFINITY;
      for (const dependency of successors) {
        const succLs = lateStart.get(dependency.successorId)!;
        const succLf = lateFinish.get(dependency.successorId)!;
        const lag = dependency.lag;
        let candidate: number;
        switch (dependency.type) {
          case "FS":
            candidate = advanceWorking(succLs, -(lag + 1), isWorking);
            break;
          case "SS":
            candidate = finishOf(advanceWorking(succLs, -lag, isWorking), activity.duration, isWorking);
            break;
          case "FF":
            candidate = advanceWorking(succLf, -lag, isWorking);
            break;
          case "SF":
            candidate = finishOf(advanceWorking(succLf, -lag, isWorking), activity.duration, isWorking);
            break;
        }
        if (candidate < finish) finish = candidate;
      }
      if (finish > deadline) finish = deadline;
    }
    const late = startOf(finish, activity.duration, isWorking);
    lateFinish.set(id, finish);
    lateStart.set(id, late);
  }

  const nodes = new Map<string, CpmNode>();
  for (const activity of activities) {
    const isWorking = calendarOf(activity);
    const es = earlyStart.get(activity.id)!;
    const ef = earlyFinish.get(activity.id)!;
    const ls = lateStart.get(activity.id)!;
    const lf = lateFinish.get(activity.id)!;
    const totalFloat = workdayDiff(es, ls, isWorking);
    nodes.set(activity.id, {
      id: activity.id,
      earlyStart: es,
      earlyFinish: ef,
      lateStart: ls,
      lateFinish: lf,
      totalFloat,
      critical: totalFloat <= 0,
    });
  }

  return { nodes, projectFinish };
}

// ---------------------------------------------------------------------------
// Forecast (E07-US05)
// ---------------------------------------------------------------------------
// Recalcula as datas "previstas" a partir do estado real da execução:
// - CONCLUÍDA ancora no realizado (actualFinish/actualStart) e propaga esse
//   fim para os sucessores;
// - EM_ANDAMENTO começa no máximo(grafo, realizado) e usa duração REMANESCENTE
//   (duração × (100 − progresso)/100);
// - demais seguem o CPM normal.
// Só forward pass — float não se aplica ao forecast.

export type ActivityStatusValue =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "ON_HOLD"
  | "CANCELLED";

export interface ForecastActual {
  status: ActivityStatusValue;
  /** Epoch day (UTC) do início real, se registrado. */
  actualStart?: number | null;
  /** Epoch day (UTC) do fim real, se registrado. */
  actualFinish?: number | null;
  /** Progresso físico 0–100. */
  physicalProgress?: number;
}

export interface ForecastNode {
  id: string;
  forecastStart: number;
  forecastFinish: number;
}

export interface ForecastResult {
  nodes: Map<string, ForecastNode>;
  projectFinish: number;
}

function remainingDuration(duration: number, progress: number | null | undefined): number {
  const pct = Math.min(100, Math.max(0, progress ?? 0));
  if (pct >= 100) return 0;
  return Math.max(0, Math.ceil((duration * (100 - pct)) / 100));
}

export function computeForecast(
  activities: CpmActivity[],
  dependencies: CpmDependency[],
  options: CpmOptions & { actuals: Record<string, ForecastActual> }
): ForecastResult {
  const defaultCalendar = compileCalendar(options.defaultCalendar ?? DEFAULT_CALENDAR);
  const calendarCache = new Map<string, DayGuard>();
  const calendarOf = (activity: CpmActivity): DayGuard => {
    if (!activity.calendarKey) return defaultCalendar;
    const cached = calendarCache.get(activity.calendarKey);
    if (cached) return cached;
    const spec = options.calendars?.[activity.calendarKey];
    const guard = spec ? compileCalendar(spec) : defaultCalendar;
    calendarCache.set(activity.calendarKey, guard);
    return guard;
  };

  const byId = new Map(activities.map((activity) => [activity.id, activity]));
  const order = topologicalOrder(activities, dependencies);

  const incoming = new Map<string, CpmDependency[]>();
  for (const activity of activities) incoming.set(activity.id, []);
  for (const dependency of dependencies) incoming.get(dependency.successorId)!.push(dependency);

  const forecastStart = new Map<string, number>();
  const forecastFinish = new Map<string, number>();

  for (const id of order) {
    const activity = byId.get(id)!;
    const isWorking = calendarOf(activity);
    const actual = options.actuals[id];

    // Concluída: o realizado manda (o que existir); sem data real, cai no grafo.
    if (actual?.status === "COMPLETED" && (actual.actualFinish ?? actual.actualStart) != null) {
      const finish = actual.actualFinish ?? actual.actualStart!;
      const start = actual.actualStart ?? finish;
      forecastStart.set(id, start);
      forecastFinish.set(id, finish);
      continue;
    }

    const duration =
      actual?.status === "IN_PROGRESS"
        ? remainingDuration(activity.duration, actual.physicalProgress)
        : activity.duration;

    let earliest = toWorkingDay(options.projectStart, isWorking);
    for (const dependency of incoming.get(id)!) {
      const predFs = forecastStart.get(dependency.predecessorId)!;
      const predFf = forecastFinish.get(dependency.predecessorId)!;
      const lag = dependency.lag;
      let candidate: number;
      switch (dependency.type) {
        case "FS":
          candidate = advanceWorking(predFf, lag + 1, isWorking);
          break;
        case "SS":
          candidate = advanceWorking(predFs, lag, isWorking);
          break;
        case "FF":
          candidate = startOf(advanceWorking(predFf, lag, isWorking), duration, isWorking);
          break;
        case "SF":
          candidate = startOf(advanceWorking(predFs, lag, isWorking), duration, isWorking);
          break;
      }
      if (candidate > earliest) earliest = candidate;
    }

    // Em andamento com início real registrado: não começa antes do realizado.
    if (actual?.status === "IN_PROGRESS" && actual.actualStart != null) {
      const realized = toWorkingDay(actual.actualStart, isWorking);
      if (realized > earliest) earliest = realized;
    }

    const start = toWorkingDay(earliest, isWorking);
    forecastStart.set(id, start);
    forecastFinish.set(id, finishOf(start, duration, isWorking));
  }

  const projectFinish = activities.length
    ? Math.max(...activities.map((activity) => forecastFinish.get(activity.id)!))
    : options.projectStart;

  const nodes = new Map<string, ForecastNode>();
  for (const activity of activities) {
    nodes.set(activity.id, {
      id: activity.id,
      forecastStart: forecastStart.get(activity.id)!,
      forecastFinish: forecastFinish.get(activity.id)!,
    });
  }

  return { nodes, projectFinish };
}
