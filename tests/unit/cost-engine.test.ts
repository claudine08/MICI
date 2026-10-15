// Testes do motor de EVM puro (E08 §29): BAC, PV, EV, AC e derivados.

import { describe, expect, it } from "vitest";
import { computeEvm, plannedProgressRatio, type EvmActivityInput } from "@/modules/cost/engine";

function activity(overrides: Partial<EvmActivityInput> & Pick<EvmActivityInput, "wbsNodeId">): EvmActivityInput {
  return {
    duration: 10,
    status: "IN_PROGRESS",
    physicalProgress: 0,
    plannedStart: null,
    plannedFinish: null,
    ...overrides,
  };
}

describe("plannedProgressRatio", () => {
  it("é 0 antes do início", () => {
    expect(plannedProgressRatio("2026-01-10", "2026-01-20", "2026-01-05")).toBe(0);
  });

  it("é 1 depois do fim", () => {
    expect(plannedProgressRatio("2026-01-10", "2026-01-20", "2026-01-25")).toBe(1);
  });

  it("interpola linearmente no meio", () => {
    // 10 dias de duração, corte no 5º dia => 0.5
    expect(plannedProgressRatio("2026-01-10", "2026-01-20", "2026-01-15")).toBeCloseTo(0.5, 5);
  });

  it("é 0 sem datas planejadas", () => {
    expect(plannedProgressRatio(null, null, "2026-01-15")).toBe(0);
  });
});

describe("computeEvm", () => {
  it("sem dados retorna zeros e índices nulos", () => {
    const result = computeEvm({ items: [], actuals: [], activities: [], dataDate: "2026-01-15" });
    expect(result.bac).toBe(0);
    expect(result.pv).toBe(0);
    expect(result.ev).toBe(0);
    expect(result.ac).toBe(0);
    expect(result.cpi).toBeNull();
    expect(result.spi).toBeNull();
    expect(result.percentPlanned).toBe(0);
  });

  it("BAC é a soma dos itens; AC é a soma dos realizados", () => {
    const result = computeEvm({
      items: [
        { code: "A", amount: 100, wbsNodeId: null },
        { code: "B", amount: 200, wbsNodeId: null },
      ],
      actuals: [{ amount: 50 }, { amount: 25 }],
      activities: [],
      dataDate: "2026-01-15",
    });
    expect(result.bac).toBe(300);
    expect(result.ac).toBe(75);
    // Sem vínculo WBS, EV/PV ficam 0; CPI = 0/75 = 0.
    expect(result.ev).toBe(0);
    expect(result.cpi).toBe(0);
    expect(result.cv).toBe(-75);
    expect(result.percentSpent).toBe(25);
  });

  it("EV usa o progresso físico médio das atividades do nó WBS do item", () => {
    const result = computeEvm({
      items: [{ code: "A", amount: 100, wbsNodeId: "wbs-1" }],
      actuals: [],
      activities: [
        activity({ wbsNodeId: "wbs-1", physicalProgress: 40 }),
        activity({ wbsNodeId: "wbs-1", physicalProgress: 80 }),
      ],
      dataDate: "2026-01-15",
    });
    // média (40+80)/2 = 60% de 100 => EV 60
    expect(result.ev).toBe(60);
    expect(result.percentEarned).toBe(60);
  });

  it("PV deriva do progresso planejado das datas do cronograma", () => {
    const result = computeEvm({
      items: [{ code: "A", amount: 100, wbsNodeId: "wbs-1" }],
      actuals: [],
      activities: [
        activity({
          wbsNodeId: "wbs-1",
          plannedStart: "2026-01-01",
          plannedFinish: "2026-01-11",
        }),
      ],
      dataDate: "2026-01-06",
    });
    // 5 de 10 dias decorridos => PV 50
    expect(result.pv).toBe(50);
    expect(result.percentPlanned).toBe(50);
    // EV 0 com PV 50 => SPI 0 (nulo só quando PV é 0, sem base de comparação).
    expect(result.spi).toBe(0);
    expect(result.sv).toBe(-50);
  });

  it("itens sem vínculo WBS não contribuem para EV nem PV", () => {
    const result = computeEvm({
      items: [{ code: "A", amount: 100, wbsNodeId: null }],
      actuals: [],
      activities: [activity({ wbsNodeId: "wbs-1", physicalProgress: 100 })],
      dataDate: "2026-01-15",
    });
    expect(result.ev).toBe(0);
    expect(result.pv).toBe(0);
  });

  it("EAC usa BAC/CPI quando há CPI confiável", () => {
    const result = computeEvm({
      items: [{ code: "A", amount: 100, wbsNodeId: "wbs-1" }],
      actuals: [{ amount: 50 }],
      activities: [activity({ wbsNodeId: "wbs-1", physicalProgress: 50 })],
      dataDate: "2026-01-15",
    });
    // EV 50, AC 50 => CPI 1 => EAC = BAC/1 = 100, VAC 0
    expect(result.cpi).toBe(1);
    expect(result.eac).toBe(100);
    expect(result.vac).toBe(0);
    expect(result.cv).toBe(0);
  });

  it("EAC sem AC retorna o próprio BAC (sem desvio)", () => {
    const result = computeEvm({
      items: [{ code: "A", amount: 100, wbsNodeId: "wbs-1" }],
      actuals: [],
      activities: [activity({ wbsNodeId: "wbs-1", physicalProgress: 30 })],
      dataDate: "2026-01-15",
    });
    expect(result.eac).toBe(100);
    expect(result.vac).toBe(0);
  });

  it("arredonda resultados em 2 casas", () => {
    const result = computeEvm({
      items: [{ code: "A", amount: 33.333, wbsNodeId: "wbs-1" }],
      actuals: [{ amount: 10.111 }],
      activities: [activity({ wbsNodeId: "wbs-1", physicalProgress: 33 })],
      dataDate: "2026-01-15",
    });
    expect(result.bac).toBe(33.33);
    expect(result.ac).toBe(10.11);
  });
});
