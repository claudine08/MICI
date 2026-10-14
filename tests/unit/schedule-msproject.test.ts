import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseFileDate,
  parseIsoDuration,
  parseMsProjectCsv,
  parseMsProjectXml,
  parseScheduleFile,
} from "@/modules/schedule/msproject";

// Parser MS Project (E07 import, §27): CSV do export PT-BR (separator ";") e
// XML schema microsoft.com/project. Fixtures = template real de cozinha
// industrial (66 tarefas, 74 dependências, 11 marcos, 10 resumos).

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
}

const CSV = "template_cronograma_cozinha_industrial.csv";
const XML = "template_cronograma_cozinha_industrial.xml";

describe("parseFileDate / parseIsoDuration", () => {
  it("aceita dd/MM/AAAA e AAAA-MM-DD", () => {
    expect(parseFileDate("02/11/2026")).toBe("2026-11-02");
    expect(parseFileDate("2026-11-02T08:00:00")).toBe("2026-11-02");
    expect(parseFileDate("")).toBeNull();
    expect(parseFileDate("abc")).toBeNull();
  });

  it("converte duração ISO em dias úteis", () => {
    expect(parseIsoDuration("PT8H0M0S", 8)).toBe(1);
    expect(parseIsoDuration("PT24H0M0S", 8)).toBe(3);
    expect(parseIsoDuration("PT0H0M0S", 8)).toBe(0);
    expect(parseIsoDuration("P3D", 8)).toBe(3);
    expect(parseIsoDuration(null, 8)).toBeNull();
  });
});

describe("parseMsProjectCsv (fixture cozinha industrial)", () => {
  const parsed = parseMsProjectCsv(fixture(CSV));

  it("lê 66 tarefas com tipos corretos", () => {
    expect(parsed.sourceFormat).toBe("CSV");
    expect(parsed.tasks).toHaveLength(66);
    expect(parsed.tasks.filter((task) => task.type === "MILESTONE")).toHaveLength(11);
    expect(parsed.tasks.filter((task) => task.type === "SUMMARY")).toHaveLength(10);
    expect(parsed.tasks.filter((task) => task.type === "TASK")).toHaveLength(45);
    expect(parsed.projectStart).toBe("2026-11-02");
    expect(parsed.warnings).toHaveLength(0);
  });

  it("mapeia colunas: datas, duração, marco, recursos e custo", () => {
    const kickoff = parsed.tasks.find((task) => task.sourceId === "3")!;
    expect(kickoff.name).toBe("Reunião de kick-off");
    expect(kickoff.wbs).toBe("2.1");
    expect(kickoff.type).toBe("TASK");
    expect(kickoff.durationDays).toBe(1);
    expect(kickoff.start).toBe("2026-11-02");
    expect(kickoff.finish).toBe("2026-11-02");
    expect(kickoff.resources).toContain("Gerente de Projetos");
    expect(kickoff.workHours).toBe(24);
    expect(kickoff.cost).toBe(3920);

    const opening = parsed.tasks.find((task) => task.sourceId === "1")!;
    expect(opening.type).toBe("MILESTONE");
    expect(opening.durationDays).toBe(0);
    expect(opening.name).toBe("INÍCIO DO PROJETO");
  });

  it("resumo sem duração ganha span útil (seg–sex)", () => {
    const summary = parsed.tasks.find((task) => task.sourceId === "6")!;
    expect(summary.type).toBe("SUMMARY");
    expect(summary.start).toBe("2026-11-02");
    expect(summary.finish).toBe("2026-11-16");
    expect(summary.durationDays).toBe(11); // 15 dias corridos - 4 de fim de semana
  });

  it("monta as 74 dependências FS a partir da coluna Predecessoras_ID_FS", () => {
    expect(parsed.dependencies).toHaveLength(74);
    const kickoffDeps = parsed.dependencies.filter((dep) => dep.successorSourceId === "3");
    expect(kickoffDeps).toEqual([
      { predecessorSourceId: "1", successorSourceId: "3", type: "FS", lagDays: 0 },
    ]);
    const matrix = parsed.dependencies.filter((dep) => dep.successorSourceId === "9");
    expect(matrix.map((dep) => dep.predecessorSourceId)).toEqual(["7", "8"]);
    expect(parsed.dependencies.every((dep) => dep.type === "FS")).toBe(true);
    expect(parsed.dependencies.every((dep) => dep.lagDays === 0)).toBe(true);
    // Nenhuma dependência aponta para linha de resumo (ids de sumário).
    const summaryIds = new Set(parsed.tasks.filter((t) => t.type === "SUMMARY").map((t) => t.sourceId));
    expect(parsed.dependencies.some((dep) => summaryIds.has(dep.predecessorSourceId))).toBe(false);
  });
});

describe("parseMsProjectXml (fixture cozinha industrial)", () => {
  const parsed = parseMsProjectXml(fixture(XML));

  it("lê o projeto: mesmo total do CSV, sem a tarefa-raiz", () => {
    expect(parsed.sourceFormat).toBe("XML");
    expect(parsed.sourceName).toBe("Template MICI - Implantação de Cozinha Industrial");
    expect(parsed.tasks).toHaveLength(66);
    expect(parsed.tasks.filter((task) => task.type === "MILESTONE")).toHaveLength(11);
    expect(parsed.tasks.filter((task) => task.type === "SUMMARY")).toHaveLength(10);
    expect(parsed.dependencies).toHaveLength(74);
    expect(parsed.projectStart).toBe("2026-11-02");
    expect(parsed.warnings).toHaveLength(0);
  });

  it("extrai a semana de trabalho do bloco Calendars (seg–sex)", () => {
    expect(parsed.calendar).not.toBeNull();
    expect(parsed.calendar!.name).toBe("Segunda a sexta");
    expect(parsed.calendar!.workingWeek).toEqual([1, 2, 3, 4, 5]);
    expect(parsed.calendar!.holidays).toEqual([]);
  });

  it("converte duração PT-hours para dias e rederiva resumos do span", () => {
    const kickoff = parsed.tasks.find((task) => task.sourceId === "3")!;
    expect(kickoff.durationDays).toBe(1); // PT8H / 8h
    expect(kickoff.start).toBe("2026-11-02");
    expect(kickoff.cost).toBe(3920);

    const plan = parsed.tasks.find((task) => task.sourceId === "4")!;
    expect(plan.durationDays).toBe(3); // PT24H

    const summary = parsed.tasks.find((task) => task.sourceId === "6")!;
    expect(summary.type).toBe("SUMMARY");
    expect(summary.durationDays).toBe(11); // span útil, não as 120h corridas do MS
  });

  it("PredecessorLink Type=1 vira FS com UID de referência", () => {
    const kickoffDeps = parsed.dependencies.filter((dep) => dep.successorSourceId === "3");
    expect(kickoffDeps).toEqual([
      { predecessorSourceId: "1", successorSourceId: "3", type: "FS", lagDays: 0 },
    ]);
    const compat = parsed.dependencies.filter((dep) => dep.successorSourceId === "18");
    expect(compat.map((dep) => dep.predecessorSourceId)).toEqual(["15", "16", "17"]);
  });

  it("tarefas dos dois formatos batem campo a campo", () => {
    const csv = parseMsProjectCsv(fixture(CSV));
    const csvById = new Map(csv.tasks.map((task) => [task.sourceId, task]));
    for (const task of parsed.tasks) {
      const twin = csvById.get(task.sourceId);
      expect(twin, `task ${task.sourceId}`).toBeTruthy();
      expect(twin!.name).toBe(task.name);
      expect(twin!.type).toBe(task.type);
      expect(twin!.durationDays).toBe(task.durationDays);
      expect(twin!.start).toBe(task.start);
      expect(twin!.finish).toBe(task.finish);
    }
    const csvDeps = new Set(
      csv.dependencies.map((dep) => `${dep.predecessorSourceId}>${dep.successorSourceId}`)
    );
    const xmlDeps = new Set(
      parsed.dependencies.map((dep) => `${dep.predecessorSourceId}>${dep.successorSourceId}`)
    );
    expect(xmlDeps).toEqual(csvDeps);
  });
});

describe("parseScheduleFile", () => {
  it("detecta por extensão e sniff", () => {
    expect(parseScheduleFile("crono.csv", fixture(CSV)).sourceFormat).toBe("CSV");
    expect(parseScheduleFile("crono.xml", fixture(XML)).sourceFormat).toBe("XML");
    expect(parseScheduleFile(null, fixture(XML)).sourceFormat).toBe("XML");
    expect(parseScheduleFile(null, fixture(CSV)).sourceFormat).toBe("CSV");
  });

  it("rejeita arquivo sem atividades", () => {
    expect(() => parseScheduleFile("x.csv", "ID;Nome_da_Tarefa\n")).toThrow();
  });
});
