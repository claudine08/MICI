import { AppError } from "@/core/errors";
import type { CalendarSpec } from "@/modules/schedule/engine";

// Importação de cronograma no formato do MS Project (E07, §27): CSV (separator
// `;`, cabeçalhos PT-BR do export) e XML (schema microsoft.com/project, Tasks +
// PredecessorLink). Parsers puros, sem I/O — o resultado normalizado alimenta
// tanto a importação num projeto quanto os templates de cronograma.

export type ParsedTaskType = "TASK" | "MILESTONE" | "SUMMARY";
export type ParsedDependencyType = "FS" | "SS" | "FF" | "SF";
export type ParsedSourceFormat = "CSV" | "XML";

export interface ParsedTask {
  /** Id da linha no arquivo (coluna ID do CSV / UID do XML). */
  sourceId: string;
  wbs: string | null;
  outlineLevel: number;
  name: string;
  type: ParsedTaskType;
  /** Dias úteis inclusivos (0 para marco). */
  durationDays: number;
  start: string | null;
  finish: string | null;
  notes: string | null;
  percentComplete: number;
  resources: string | null;
  workHours: number | null;
  cost: number | null;
}

export interface ParsedDependency {
  predecessorSourceId: string;
  successorSourceId: string;
  type: ParsedDependencyType;
  lagDays: number;
}

export interface ParsedSchedule {
  sourceName: string;
  sourceFormat: ParsedSourceFormat;
  projectStart: string | null;
  calendar: (CalendarSpec & { name: string }) | null;
  tasks: ParsedTask[];
  dependencies: ParsedDependency[];
  warnings: string[];
}

const MAX_TASKS = 5000;
const MAX_DEPENDENCIES = 20000;

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeHeader(value: string): string {
  return stripAccents(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = stripAccents(value.trim().toLowerCase());
  return normalized === "sim" || normalized === "yes" || normalized === "true" || normalized === "1";
}

const BR_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/** Aceita dd/MM/AAAA e AAAA-MM-DD (com ou sem hora) → AAAA-MM-DD. */
export function parseFileDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const br = BR_DATE.exec(trimmed);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = ISO_DATE.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

const WEEKDAY_OF_EPOCH = (day: number) => (((day + 4) % 7) + 7) % 7; // 0=domingo

/** Dias úteis inclusivos de start a finish no calendário dado (seg–sex padrão). */
function countWorkingDays(start: string, finish: string, spec: CalendarSpec): number {
  const startDay = Math.floor(Date.parse(`${start}T00:00:00.000Z`) / 86_400_000);
  const finishDay = Math.floor(Date.parse(`${finish}T00:00:00.000Z`) / 86_400_000);
  if (Number.isNaN(startDay) || Number.isNaN(finishDay) || finishDay < startDay) return 0;
  const week = new Set(spec.workingWeek);
  const holidays = new Set(spec.holidays);
  let count = 0;
  for (let day = startDay; day <= finishDay; day += 1) {
    if (!week.has(WEEKDAY_OF_EPOCH(day))) continue;
    const iso = new Date(day * 86_400_000).toISOString().slice(0, 10);
    if (holidays.has(iso)) continue;
    count += 1;
  }
  return count;
}

function assertLimits(tasks: ParsedTask[], dependencies: ParsedDependency[]) {
  if (tasks.length === 0) {
    throw new AppError("VALIDATION_ERROR", "O arquivo não contém nenhuma atividade reconhecida.");
  }
  if (tasks.length > MAX_TASKS) {
    throw new AppError("VALIDATION_ERROR", `Arquivo grande demais (máximo ${MAX_TASKS} atividades).`);
  }
  if (dependencies.length > MAX_DEPENDENCIES) {
    throw new AppError("VALIDATION_ERROR", "Arquivo com dependências demais.");
  }
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Divide linha CSV respeitando aspas (campos podem conter `;`). */
function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inQuotes) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

interface CsvColumnMap {
  id?: number;
  wbs?: number;
  level?: number;
  name?: number;
  type?: number;
  duration?: number;
  start?: number;
  finish?: number;
  predecessors?: number;
  resources?: number;
  work?: number;
  cost?: number;
  milestone?: number;
  summary?: number;
  notes?: number;
  percent?: number;
}

const CSV_HEADER_ALIASES: Record<keyof CsvColumnMap, string[]> = {
  id: ["id", "identificador", "taskid"],
  wbs: ["wbs"],
  level: ["nivelestrutura", "outlinelevel", "nivel"],
  name: ["nomedatarefa", "taskname", "name", "tarefa"],
  type: ["tipo", "type"],
  duration: ["duracaodiasuteis", "duracaodias", "duration", "duracao"],
  start: ["inicio", "start"],
  finish: ["termino", "fim", "finish"],
  predecessors: ["predecessorasidfs", "predecessoraidfs", "predecessoraid", "predecessorasid", "predecessors", "predecessoras"],
  resources: ["recursos", "resourcenames", "resources"],
  work: ["trabalhohorasestimado", "trabalhohoras", "trabalho", "work"],
  cost: ["custototalr", "custototal", "cost", "custo"],
  milestone: ["marco", "milestone"],
  summary: ["resumo", "summary", "tarefaderesumo"],
  notes: ["observacoes", "notes", "comentario", "obs"],
  percent: ["percentcomplete", "percentualconcluido", "avanco", "%concluido"],
};

function mapCsvColumns(headerCells: string[], delimiter: string): CsvColumnMap {
  const map: CsvColumnMap = {};
  headerCells.forEach((cell, index) => {
    const normalized = normalizeHeader(cell);
    if (!normalized) return;
    for (const key of Object.keys(CSV_HEADER_ALIASES) as (keyof CsvColumnMap)[]) {
      const aliases = CSV_HEADER_ALIASES[key];
      if (aliases.includes(normalized) && map[key] === undefined) {
        map[key] = index;
        break;
      }
    }
  });
  if (map.name === undefined) {
    throw new AppError("VALIDATION_ERROR", `CSV sem a coluna de nome da tarefa (ex.: "Nome_da_Tarefa").`, {
      details: { delimiter, header: headerCells },
    });
  }
  return map;
}

// "3" | "3FS" | "3SS+2d" | "17FF-1w" — id + tipo opcional + lag opcional.
const PREDECESSOR_TOKEN = /^(\d+)\s*(FS|SS|FF|SF)?\s*(?:([+-]\d+)\s*([a-zA-Z]))?$/;

function parsePredecessorCell(
  cell: string,
  warnings: string[],
  rowLabel: string
): { sourceId: string; type: ParsedDependencyType; lagDays: number }[] {
  if (!cell) return [];
  const tokens = cell.split(/[;,]/).map((token) => token.trim()).filter(Boolean);
  const parsed: { sourceId: string; type: ParsedDependencyType; lagDays: number }[] = [];
  for (const token of tokens) {
    const match = PREDECESSOR_TOKEN.exec(token);
    if (!match) {
      warnings.push(`${rowLabel}: predecessor inválida "${token}" ignorada.`);
      continue;
    }
    const type = (match[2] ?? "FS") as ParsedDependencyType;
    let lagDays = 0;
    if (match[3]) {
      const raw = Number(match[3]);
      const unit = (match[4] ?? "d").toLowerCase();
      if (unit === "w") lagDays = raw * 5;
      else if (unit === "h") lagDays = Math.round(raw / 8);
      else lagDays = raw;
    }
    parsed.push({ sourceId: match[1], type, lagDays });
  }
  return parsed;
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseMsProjectCsv(text: string): ParsedSchedule {
  const warnings: string[] = [];
  const rawLines = text.split(/\r\n|\r|\n/).filter((line) => line.trim().length > 0);
  if (rawLines.length < 2) {
    throw new AppError("VALIDATION_ERROR", "CSV sem linhas de dados.");
  }
  const headerLine = rawLines[0];
  const delimiter = (headerLine.match(/;/g) ?? []).length >= (headerLine.match(/,/g) ?? []).length ? ";" : ",";
  const headers = splitCsvLine(headerLine, delimiter);
  const columns = mapCsvColumns(headers, delimiter);

  const defaultSpec: CalendarSpec = { workingWeek: [1, 2, 3, 4, 5], holidays: [] };
  const tasks: ParsedTask[] = [];
  const dependencies: ParsedDependency[] = [];
  const seenIds = new Set<string>();
  let sourceName = "Cronograma importado";

  for (let rowIndex = 1; rowIndex < rawLines.length; rowIndex += 1) {
    const cells = splitCsvLine(rawLines[rowIndex], delimiter);
    const rowLabel = `Linha ${rowIndex + 1}`;
    const get = (key: keyof CsvColumnMap) => {
      const index = columns[key];
      return index === undefined ? undefined : cells[index];
    };

    const rawId = get("id") || String(rowIndex);
    const sourceId = rawId.trim();
    if (seenIds.has(sourceId)) {
      warnings.push(`${rowLabel}: id "${sourceId}" repetido — a linha foi ignorada.`);
      continue;
    }

    const name = (get("name") ?? "").trim();
    if (!name) {
      warnings.push(`${rowLabel}: sem nome — a linha foi ignorada.`);
      continue;
    }

    const summary = parseBoolean(get("summary")) || (get("type") ?? "").trim().toLowerCase() === "resumo";
    const milestone =
      parseBoolean(get("milestone")) ||
      (get("type") ?? "").trim().toLowerCase() === "marco" ||
      (!summary && parseInteger(get("duration"), 1) === 0 && (get("duration") ?? "").trim() !== "");
    const type: ParsedTaskType = summary ? "SUMMARY" : milestone ? "MILESTONE" : "TASK";

    const start = parseFileDate(get("start"));
    const finish = parseFileDate(get("finish"));
    if (start && finish && start > finish) {
      warnings.push(`${rowLabel}: início posterior ao fim — datas ignoradas.`);
    }
    const validStart = start && finish && start <= finish ? start : start;
    const validFinish = start && finish && start <= finish ? finish : null;

    let durationDays: number;
    const rawDuration = (get("duration") ?? "").trim();
    if (type === "MILESTONE") {
      durationDays = 0;
    } else if (rawDuration) {
      durationDays = Math.max(0, Math.round(parseInteger(rawDuration, 0)));
    } else if (validStart && validFinish) {
      durationDays = countWorkingDays(validStart, validFinish, defaultSpec);
    } else {
      durationDays = type === "SUMMARY" ? 0 : 1;
      if (type !== "SUMMARY") warnings.push(`${rowLabel}: sem duração — usando 1 dia.`);
    }
    if (durationDays > 3650) durationDays = 3650;

    const percentComplete = Math.min(100, Math.max(0, Math.round(parseInteger(get("percent"), 0))));

    const task: ParsedTask = {
      sourceId,
      wbs: (get("wbs") ?? "").trim() || null,
      outlineLevel: parseInteger(get("level"), 1),
      name,
      type,
      durationDays,
      start: validStart,
      finish: validFinish,
      notes: (get("notes") ?? "").trim() || null,
      percentComplete,
      resources: (get("resources") ?? "").trim() || null,
      workHours: columns.work !== undefined ? parseInteger(get("work"), 0) : null,
      cost: columns.cost !== undefined ? parseInteger(get("cost"), 0) : null,
    };
    tasks.push(task);
    seenIds.add(sourceId);

    if (columns.predecessors !== undefined) {
      for (const predecessor of parsePredecessorCell(get("predecessors") ?? "", warnings, rowLabel)) {
        dependencies.push({
          predecessorSourceId: predecessor.sourceId,
          successorSourceId: sourceId,
          type: predecessor.type,
          lagDays: predecessor.lagDays,
        });
      }
    }

    if (tasks.length === 1) sourceName = name;
  }

  const projectStart = tasks.reduce<string | null>(
    (earliest, task) => (task.start && (!earliest || task.start < earliest) ? task.start : earliest),
    null
  );

  assertLimits(tasks, dependencies);
  return {
    sourceName,
    sourceFormat: "CSV",
    projectStart,
    calendar: null,
    tasks,
    dependencies,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// XML (schema microsoft.com/project)
// ---------------------------------------------------------------------------

function xmlBlocks(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  const blocks: string[] = [];
  let match = pattern.exec(xml);
  while (match) {
    blocks.push(match[1]);
    match = pattern.exec(xml);
  }
  return blocks;
}

function xmlText(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(block);
  if (!match) return null;
  const value = match[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
  return value === "" ? null : value;
}

function xmlNumber(block: string, tag: string): number | null {
  const text = xmlText(block, tag);
  if (text === null) return null;
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

/** ISO-8601 duração do MS Project: `PT24H0M0S` (horas) ou `P3D`. */
export function parseIsoDuration(value: string | null, hoursPerDay: number): number | null {
  if (!value) return null;
  const time = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value.trim());
  if (time) {
    const hours = Number(time[1] ?? 0) + Number(time[2] ?? 0) / 60 + Number(time[3] ?? 0) / 3600;
    if (hours <= 0) return 0;
    return Math.round(hours / hoursPerDay);
  }
  const days = /^P(?:(\d+)D)?$/.exec(value.trim());
  if (days) return Number(days[1] ?? 0);
  return null;
}

const DEPENDENCY_TYPES: Record<number, ParsedDependencyType> = { 1: "FS", 2: "SS", 3: "FF", 4: "SF" };

/** Lag do MS Project: LinkLag com unidade em LagFormat (7 = dias). */
function parseXmlLag(linkBlock: string, warnings: number[]): number {
  const lag = xmlNumber(linkBlock, "LinkLag") ?? 0;
  if (lag === 0) return 0;
  const format = xmlNumber(linkBlock, "LagFormat");
  // LagFormat 7 = dias; 21 = semanas; 513 = horas (8h/dia); demais → dias.
  if (format === 21) return lag * 5;
  if (format === 513) return Math.round(lag / 8);
  warnings[0] += 1;
  return lag;
}

function parseXmlCalendar(xml: string): (CalendarSpec & { name: string }) | null {
  const calendarBlock = xmlBlocks(xml, "Calendar")[0];
  if (!calendarBlock) return null;
  const name = xmlText(calendarBlock, "Name") ?? "Calendário do arquivo";
  const workingWeek: number[] = [];
  const holidays: string[] = [];
  for (const weekDay of xmlBlocks(calendarBlock, "WeekDay")) {
    const dayType = xmlNumber(weekDay, "DayType");
    const working = xmlNumber(weekDay, "DayWorking");
    if (dayType !== null && working === 1) {
      // MS: DayType 1 = domingo … 7 = sábado → 0 … 6.
      workingWeek.push(Math.min(6, Math.max(0, dayType - 1)));
    }
  }
  if (xmlBlocks(calendarBlock, "Exception").length > 0) {
    // Exceções do MS (feriados/ferias) não são mapeadas automaticamente —
    // o usuário pode cadastrá-las no calendário do MICI depois do import.
    return { name, workingWeek: workingWeek.length ? workingWeek : [1, 2, 3, 4, 5], holidays };
  }
  if (workingWeek.length === 0) return null;
  return { name, workingWeek: workingWeek.sort((a, b) => a - b), holidays };
}

export function parseMsProjectXml(text: string): ParsedSchedule {
  const warnings: string[] = [];
  if (!/<Project[\s>]/.test(text)) {
    throw new AppError("VALIDATION_ERROR", "XML fora do formato do MS Project (esperado <Project>).");
  }

  const projectBlock = xmlBlocks(text, "Project")[0] ?? "";
  const sourceName = xmlText(projectBlock, "Name") ?? xmlText(projectBlock, "Title") ?? "Cronograma importado";
  const projectStart = parseFileDate(xmlText(projectBlock, "StartDate"));
  const minutesPerDay = xmlNumber(projectBlock, "MinutesPerDay") ?? 480;
  const hoursPerDay = Math.max(1, minutesPerDay / 60);
  const calendar = parseXmlCalendar(text);

  const durationSpec: CalendarSpec = calendar ?? { workingWeek: [1, 2, 3, 4, 5], holidays: [] };
  const summaryWarnings = [0];

  const tasks: ParsedTask[] = [];
  const dependencies: ParsedDependency[] = [];
  const seenIds = new Set<string>();

  for (const taskBlock of xmlBlocks(text, "Task")) {
    const uid = xmlText(taskBlock, "UID") ?? xmlText(taskBlock, "ID");
    const wbs = xmlText(taskBlock, "WBS");
    const outlineLevel = xmlNumber(taskBlock, "OutlineLevel") ?? 1;
    const name = xmlText(taskBlock, "Name");
    if (!uid || !name) continue;
    // Tarefa-raiz do projeto (OutlineLevel 0 / WBS 0) não é atividade.
    if (outlineLevel <= 0 || wbs === "0") continue;
    if (seenIds.has(uid)) {
      warnings.push(`UID ${uid} repetido — a tarefa foi ignorada.`);
      continue;
    }

    const summary = (xmlNumber(taskBlock, "Summary") ?? 0) === 1;
    const milestone = (xmlNumber(taskBlock, "Milestone") ?? 0) === 1;
    const type: ParsedTaskType = summary ? "SUMMARY" : milestone ? "MILESTONE" : "TASK";

    const start = parseFileDate(xmlText(taskBlock, "Start"));
    const finish = parseFileDate(xmlText(taskBlock, "Finish"));
    if (start && finish && start > finish) {
      warnings.push(`Tarefa "${name}": início posterior ao fim — datas ignoradas.`);
    }
    const validStart = start && finish && start <= finish ? start : start;
    const validFinish = start && finish && start <= finish ? finish : null;

    const durationFromXml = parseIsoDuration(xmlText(taskBlock, "Duration"), hoursPerDay);
    let durationDays: number;
    if (type === "MILESTONE") {
      durationDays = 0;
    } else if (type === "SUMMARY" && validStart && validFinish) {
      // Duração do resumo no MS vem em horas de calendário corrido — o span
      // útil entre início/fim é o valor coerente com o motor do MICI.
      durationDays = countWorkingDays(validStart, validFinish, durationSpec);
    } else if (durationFromXml !== null) {
      durationDays = Math.min(3650, Math.max(0, durationFromXml));
    } else if (validStart && validFinish) {
      durationDays = countWorkingDays(validStart, validFinish, durationSpec);
    } else {
      durationDays = type === "SUMMARY" ? 0 : 1;
      warnings.push(`Tarefa "${name}": sem duração — usando 1 dia.`);
    }

    const percentComplete = Math.min(100, Math.max(0, Math.round(xmlNumber(taskBlock, "PercentComplete") ?? 0)));

    tasks.push({
      sourceId: uid,
      wbs,
      outlineLevel,
      name,
      type,
      durationDays,
      start: validStart,
      finish: validFinish,
      notes: xmlText(taskBlock, "Notes"),
      percentComplete,
      resources: null,
      workHours: (() => {
        const work = xmlText(taskBlock, "Work");
        if (!work) return null;
        const hours = parseIsoDuration(work, 1);
        return hours;
      })(),
      cost: xmlNumber(taskBlock, "Cost"),
    });
    seenIds.add(uid);

    for (const link of xmlBlocks(taskBlock, "PredecessorLink")) {
      const predecessorUid = xmlText(link, "PredecessorUID");
      if (!predecessorUid) continue;
      const rawType = xmlNumber(link, "Type") ?? 1;
      const lagFormat = xmlNumber(link, "LagFormat");
      if (lagFormat !== null && ![7, 21, 513].includes(lagFormat)) {
        warnings.push(`Tarefa "${name}": unidade de lag não suportada (${lagFormat}) — tratada em dias.`);
      }
      dependencies.push({
        predecessorSourceId: predecessorUid,
        successorSourceId: uid,
        type: DEPENDENCY_TYPES[rawType] ?? "FS",
        lagDays: parseXmlLag(link, summaryWarnings),
      });
    }
  }

  if (summaryWarnings[0] > 0) {
    warnings.push(`${summaryWarnings[0]} dependência(s) com lag em unidade não-dia convertidas como dias.`);
  }
  if (/<Exceptions[\s>]/.test(text)) {
    warnings.push("O arquivo contém exceções de calendário (feriados/férias): revise o calendário no MICI.");
  }

  const projectStartFromTasks = tasks.reduce<string | null>(
    (earliest, task) => (task.start && (!earliest || task.start < earliest) ? task.start : earliest),
    null
  );

  assertLimits(tasks, dependencies);
  return {
    sourceName,
    sourceFormat: "XML",
    projectStart: projectStart ?? projectStartFromTasks,
    calendar,
    tasks,
    dependencies,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function parseScheduleFile(filename: string | null, content: string): ParsedSchedule {
  const lower = (filename ?? "").toLowerCase();
  const trimmed = content.trimStart();
  const looksXml = trimmed.startsWith("<") || lower.endsWith(".xml");
  if (looksXml) return parseMsProjectXml(content);
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) return parseMsProjectCsv(content);
  // Sniff: cabeçalho com ponto-e-vírgula → CSV; senão tenta XML.
  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? "";
  if (firstLine.includes(";")) return parseMsProjectCsv(content);
  return parseMsProjectXml(content);
}
