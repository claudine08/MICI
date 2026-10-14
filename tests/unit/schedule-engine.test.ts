import { describe, expect, it } from "vitest";
import { AppError } from "@/core/errors";
import { computeCpm, computeForecast, dateToDay, dayToIso } from "@/modules/schedule/engine";

// Motor de caminho crítico (E07-US06, §27): forward/backward pass, lag/lead
// nos 4 tipos, marco de duração 0, ciclo e float/crítico.
// Forecast (E07-US05): datas previstas ancoradas no realizado.

// 2026-01-05 é segunda-feira.
const START = dateToDay("2026-01-05");

function activity(id: string, duration: number) {
  return { id, code: id.toUpperCase(), duration };
}

function dep(
  predecessorId: string,
  successorId: string,
  type: "FS" | "SS" | "FF" | "SF",
  lag = 0
) {
  return { predecessorId, successorId, type, lag };
}

describe("FS com lag e lead", () => {
  it("cadeia FS encadeia dias úteis e marca o caminho crítico", () => {
    const result = computeCpm(
      [activity("a", 3), activity("b", 2)],
      [dep("a", "b", "FS")],
      { projectStart: START }
    );

    const a = result.nodes.get("a")!;
    const b = result.nodes.get("b")!;
    expect(dayToIso(a.earlyStart)).toBe("2026-01-05");
    expect(dayToIso(a.earlyFinish)).toBe("2026-01-07");
    expect(dayToIso(b.earlyStart)).toBe("2026-01-08");
    expect(dayToIso(b.earlyFinish)).toBe("2026-01-09");
    expect(dayToIso(result.projectFinish)).toBe("2026-01-09");

    expect(a.totalFloat).toBe(0);
    expect(b.totalFloat).toBe(0);
    expect(a.critical).toBe(true);
    expect(b.critical).toBe(true);
  });

  it("lag positivo pula dias úteis (fim sex → +3 úteis = ter)", () => {
    const result = computeCpm(
      [activity("a", 3), activity("b", 2)],
      [dep("a", "b", "FS", 2)],
      { projectStart: START }
    );
    // A termina sex 07/01; lag 2 ⇒ sucessora espera 2 dias úteis extras
    // (08, 09) e inicia na terça 12/01.
    expect(dayToIso(result.nodes.get("b")!.earlyStart)).toBe("2026-01-12");
  });

  it("lead (lag negativo) sobrepõe as atividades", () => {
    const result = computeCpm(
      [activity("a", 3), activity("b", 2)],
      [dep("a", "b", "FS", -1)],
      { projectStart: START }
    );
    // Lead de 1 dia: sucessora inicia no mesmo dia em que a predecessor termina.
    expect(dayToIso(result.nodes.get("a")!.earlyFinish)).toBe("2026-01-07");
    expect(dayToIso(result.nodes.get("b")!.earlyStart)).toBe("2026-01-07");
    expect(dayToIso(result.nodes.get("b")!.earlyFinish)).toBe("2026-01-08");
  });
});

describe("SS, FF e SF", () => {
  it("SS libera início simultâneo e dá folga à sucessora", () => {
    const result = computeCpm(
      [activity("a", 3), activity("b", 2)],
      [dep("a", "b", "SS")],
      { projectStart: START }
    );
    const a = result.nodes.get("a")!;
    const b = result.nodes.get("b")!;

    expect(dayToIso(b.earlyStart)).toBe("2026-01-05");
    expect(dayToIso(b.earlyFinish)).toBe("2026-01-06");
    // A ancora o fim do projeto (07/01); B tem 1 dia útil de folga.
    expect(b.totalFloat).toBe(1);
    expect(b.critical).toBe(false);
    expect(a.totalFloat).toBe(0);
    expect(a.critical).toBe(true);
  });

  it("FF amarra o fim da sucessora ao fim da predecessor", () => {
    const result = computeCpm(
      [activity("a", 3), activity("b", 2)],
      [dep("a", "b", "FF")],
      { projectStart: START }
    );
    const b = result.nodes.get("b")!;
    expect(dayToIso(b.earlyFinish)).toBe("2026-01-07");
    expect(dayToIso(b.earlyStart)).toBe("2026-01-06");
    expect(b.totalFloat).toBe(0);
    expect(b.critical).toBe(true);
  });

  it("SF amarra o fim da sucessora ao início da predecessor", () => {
    const result = computeCpm(
      [activity("a", 3), activity("b", 2)],
      [dep("a", "b", "SF")],
      { projectStart: START }
    );
    const a = result.nodes.get("a")!;
    const b = result.nodes.get("b")!;

    // Marco/sucessora não pode terminar antes do início de A (clamp no início).
    expect(dayToIso(b.earlyFinish)).toBe("2026-01-06");
    expect(dayToIso(b.earlyStart)).toBe("2026-01-05");
    expect(a.critical).toBe(true);
    expect(b.totalFloat).toBeGreaterThan(0);
  });
});

describe("marcos e float", () => {
  it("marco de duração 0 inicia e termina no mesmo dia", () => {
    const result = computeCpm(
      [activity("a", 3), activity("m", 0)],
      [dep("a", "m", "FS")],
      { projectStart: START }
    );
    const milestone = result.nodes.get("m")!;
    expect(dayToIso(milestone.earlyStart)).toBe("2026-01-08");
    expect(dayToIso(milestone.earlyFinish)).toBe("2026-01-08");
    expect(milestone.critical).toBe(true);
  });

  it("atividade paralela livre acumula float até o fim do projeto", () => {
    const result = computeCpm(
      [activity("a", 4), activity("b", 1), activity("c", 1)],
      [dep("a", "b", "FS")],
      { projectStart: START }
    );
    // Projeto termina 09/01 (a: 05–08, b: 09); c inicia 05 e pode escorregar.
    expect(dayToIso(result.projectFinish)).toBe("2026-01-09");
    const c = result.nodes.get("c")!;
    expect(c.totalFloat).toBe(4);
    expect(c.critical).toBe(false);
    expect(result.nodes.get("a")!.critical).toBe(true);
  });

  it("feriado do calendário é pulado no cálculo", () => {
    const result = computeCpm(
      [
        { id: "a", code: "A", duration: 2, calendarKey: "cal1" },
        { id: "b", code: "B", duration: 1, calendarKey: "cal1" },
      ],
      [dep("a", "b", "FS")],
      {
        projectStart: START,
        calendars: { cal1: { workingWeek: [1, 2, 3, 4, 5], holidays: ["2026-01-06"] } },
      }
    );
    // A: seg 05 e qua 07 (ter 06 é feriado); B inicia qui 08.
    expect(dayToIso(result.nodes.get("a")!.earlyFinish)).toBe("2026-01-07");
    expect(dayToIso(result.nodes.get("b")!.earlyStart)).toBe("2026-01-08");
  });

  it("defaultCalendar cobre atividades sem calendário próprio (E07-US03)", () => {
    const result = computeCpm([activity("a", 2)], [], {
      projectStart: START,
      defaultCalendar: { workingWeek: [1, 2, 3, 4, 5], holidays: ["2026-01-06"] },
    });
    // Seg 05 + 1 útil: ter 06 é feriado ⇒ termina qua 07 (sem default seria 06).
    expect(dayToIso(result.nodes.get("a")!.earlyFinish)).toBe("2026-01-07");
  });
});

describe("ciclo e validação", () => {
  it("dependência cíclica é rejeitada", () => {
    let caught: unknown;
    try {
      computeCpm(
        [activity("a", 1), activity("b", 1)],
        [dep("a", "b", "FS"), dep("b", "a", "FS")],
        { projectStart: START }
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).code).toBe("VALIDATION_ERROR");
    expect((caught as AppError).message).toMatch(/ciclo/i);
  });

  it("dependência de si mesmo é rejeitada", () => {
    expect(() =>
      computeCpm([activity("a", 1)], [dep("a", "a", "FS")], { projectStart: START })
    ).toThrowError(/si mesma|ciclo/i);
  });

  it("dependência apontando para atividade inexistente é rejeitada", () => {
    expect(() =>
      computeCpm([activity("a", 1)], [dep("a", "ghost", "FS")], { projectStart: START })
    ).toThrowError(/inexistente/i);
  });
});

describe("forecast (E07-US05)", () => {
  it("concluída ancora no realizado e propaga para a sucessora", () => {
    const result = computeForecast(
      [activity("a", 3), activity("b", 2)],
      [dep("a", "b", "FS")],
      {
        projectStart: START,
        actuals: {
          a: {
            status: "COMPLETED",
            actualStart: dateToDay("2026-01-05"),
            actualFinish: dateToDay("2026-01-07"),
          },
        },
      }
    );

    const a = result.nodes.get("a")!;
    const b = result.nodes.get("b")!;
    expect(dayToIso(a.forecastStart)).toBe("2026-01-05");
    expect(dayToIso(a.forecastFinish)).toBe("2026-01-07");
    expect(dayToIso(b.forecastStart)).toBe("2026-01-08");
    expect(dayToIso(b.forecastFinish)).toBe("2026-01-09");
  });

  it("em andamento com início real atrasado empurra a sucessora", () => {
    const result = computeForecast(
      [activity("a", 4), activity("b", 2)],
      [dep("a", "b", "FS")],
      {
        projectStart: START,
        actuals: {
          a: { status: "IN_PROGRESS", actualStart: dateToDay("2026-01-07"), physicalProgress: 0 },
        },
      }
    );

    // Atraso de 2 dias: A inicia qua 07 (realizado) e termina seg 12;
    // B inicia ter 13 — em vez dos 08–09 do plano.
    expect(dayToIso(result.nodes.get("a")!.forecastStart)).toBe("2026-01-07");
    expect(dayToIso(result.nodes.get("a")!.forecastFinish)).toBe("2026-01-12");
    expect(dayToIso(result.nodes.get("b")!.forecastStart)).toBe("2026-01-13");
    expect(dayToIso(result.nodes.get("b")!.forecastFinish)).toBe("2026-01-14");
  });

  it("usa duração remanescente proporcional ao progresso", () => {
    const forecastWithProgress = computeForecast(
      [activity("a", 4), activity("b", 2)],
      [dep("a", "b", "FS")],
      {
        projectStart: START,
        actuals: {
          a: { status: "IN_PROGRESS", actualStart: START, physicalProgress: 50 },
        },
      }
    );
    // 4 d × 50% restantes = 2 d ⇒ A termina 06/01 e B inicia 07/01.
    expect(dayToIso(forecastWithProgress.nodes.get("a")!.forecastFinish)).toBe("2026-01-06");
    expect(dayToIso(forecastWithProgress.nodes.get("b")!.forecastStart)).toBe("2026-01-07");

    const withoutProgress = computeForecast(
      [activity("a", 4), activity("b", 2)],
      [dep("a", "b", "FS")],
      {
        projectStart: START,
        actuals: { a: { status: "IN_PROGRESS", actualStart: START, physicalProgress: 0 } },
      }
    );
    expect(dayToIso(withoutProgress.nodes.get("b")!.forecastStart)).toBe("2026-01-09");
  });

  it("progresso 100% sem data de fim usa duração restante 0", () => {
    const result = computeForecast([activity("a", 5)], [], {
      projectStart: START,
      actuals: { a: { status: "IN_PROGRESS", actualStart: START, physicalProgress: 100 } },
    });
    const a = result.nodes.get("a")!;
    expect(dayToIso(a.forecastStart)).toBe("2026-01-05");
    expect(dayToIso(a.forecastFinish)).toBe("2026-01-05");
  });

  it("sem dados de execução o forecast segue o CPM", () => {
    const activities = [activity("a", 3), activity("b", 2)];
    const dependencies = [dep("a", "b", "FS")];
    const cpm = computeCpm(activities, dependencies, { projectStart: START });
    const forecast = computeForecast(activities, dependencies, { projectStart: START, actuals: {} });

    for (const node of cpm.nodes.values()) {
      const predicted = forecast.nodes.get(node.id)!;
      expect(predicted.forecastStart).toBe(node.earlyStart);
      expect(predicted.forecastFinish).toBe(node.earlyFinish);
    }
    expect(forecast.projectFinish).toBe(cpm.projectFinish);
  });
});
