// Testes do motor de riscos puro (E10 §32): exposição, níveis da matriz
// configurável e máquina de estados do ciclo Identify → … → Close.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_RISK_MATRIX,
  RISK_STATUSES,
  RISK_TRANSITIONS,
  availableRiskActions,
  isValidMatrixSpec,
  isValidProbabilityOrImpact,
  isRiskOpen,
  isRiskTerminal,
  nextRiskStatus,
  residualRiskLevel,
  riskExposure,
  riskLevel,
} from "@/modules/risk/engine";

describe("riskExposure", () => {
  it("é a probabilidade × impacto", () => {
    expect(riskExposure(1, 1)).toBe(1);
    expect(riskExposure(3, 4)).toBe(12);
    expect(riskExposure(5, 5)).toBe(25);
  });
});

describe("riskLevel (matriz default 4/9/16)", () => {
  it("cobre os quatro níveis nos limites", () => {
    expect(riskLevel(1)).toBe("LOW");
    expect(riskLevel(4)).toBe("LOW");
    expect(riskLevel(5)).toBe("MEDIUM");
    expect(riskLevel(9)).toBe("MEDIUM");
    expect(riskLevel(10)).toBe("HIGH");
    expect(riskLevel(16)).toBe("HIGH");
    expect(riskLevel(17)).toBe("CRITICAL");
    expect(riskLevel(25)).toBe("CRITICAL");
  });

  it("muda de nível com matriz configurável (E10-US02)", () => {
    const custom = { lowMax: 2, mediumMax: 6, highMax: 12 };
    expect(isValidMatrixSpec(custom)).toBe(true);
    expect(riskLevel(6, custom)).toBe("MEDIUM");
    expect(riskLevel(7, custom)).toBe("HIGH");
    expect(riskLevel(12, custom)).toBe("HIGH");
    expect(riskLevel(13, custom)).toBe("CRITICAL");
    // O mesmo exposure 8 era MEDIUM na default e é HIGH na custom.
    expect(riskLevel(8, DEFAULT_RISK_MATRIX)).toBe("MEDIUM");
    expect(riskLevel(8, custom)).toBe("HIGH");
  });
});

describe("isValidMatrixSpec", () => {
  it("exige 1 ≤ low < medium < high ≤ 25", () => {
    expect(isValidMatrixSpec({ lowMax: 4, mediumMax: 9, highMax: 16 })).toBe(true);
    expect(isValidMatrixSpec({ lowMax: 4, mediumMax: 4, highMax: 16 })).toBe(false);
    expect(isValidMatrixSpec({ lowMax: 0, mediumMax: 9, highMax: 16 })).toBe(false);
    expect(isValidMatrixSpec({ lowMax: 4, mediumMax: 9, highMax: 26 })).toBe(false);
  });
});

describe("isValidProbabilityOrImpact", () => {
  it("aceita apenas inteiros 1–5", () => {
    expect(isValidProbabilityOrImpact(1)).toBe(true);
    expect(isValidProbabilityOrImpact(5)).toBe(true);
    expect(isValidProbabilityOrImpact(0)).toBe(false);
    expect(isValidProbabilityOrImpact(6)).toBe(false);
    expect(isValidProbabilityOrImpact(2.5)).toBe(false);
  });
});

describe("residualRiskLevel", () => {
  it("é null sem residual e deriva do exposure residual", () => {
    expect(residualRiskLevel(null)).toBeNull();
    expect(residualRiskLevel(4)).toBe("LOW");
    expect(residualRiskLevel(20)).toBe("CRITICAL");
  });
});

describe("máquina de estados (§32)", () => {
  it("percorre o ciclo completo Identify → … → Close", () => {
    expect(nextRiskStatus("IDENTIFIED", "ANALYZE")).toBe("ANALYZED");
    expect(nextRiskStatus("ANALYZED", "PLAN")).toBe("PLANNED");
    expect(nextRiskStatus("PLANNED", "IMPLEMENT")).toBe("TREATING");
    expect(nextRiskStatus("TREATING", "MONITOR")).toBe("MONITORING");
    expect(nextRiskStatus("MONITORING", "CLOSE")).toBe("CLOSED");
  });

  it("permite replanejar (PLAN em PLANNED), retratar (TREAT) e reabrir", () => {
    expect(nextRiskStatus("PLANNED", "PLAN")).toBe("PLANNED");
    expect(nextRiskStatus("MONITORING", "TREAT")).toBe("TREATING");
    expect(nextRiskStatus("CLOSED", "REOPEN")).toBe("MONITORING");
    expect(nextRiskStatus("CANCELLED", "REOPEN")).toBe("IDENTIFIED");
  });

  it("cancela a partir de qualquer status não terminal", () => {
    for (const status of [
      "IDENTIFIED",
      "ANALYZED",
      "PLANNED",
      "TREATING",
      "MONITORING",
    ] as const) {
      expect(nextRiskStatus(status, "CANCEL")).toBe("CANCELLED");
    }
    expect(nextRiskStatus("CLOSED", "CANCEL")).toBeNull();
    expect(nextRiskStatus("CANCELLED", "CANCEL")).toBeNull();
  });

  it("rejeita transições ilegais", () => {
    expect(nextRiskStatus("IDENTIFIED", "CLOSE")).toBeNull();
    expect(nextRiskStatus("IDENTIFIED", "IMPLEMENT")).toBeNull();
    expect(nextRiskStatus("ANALYZED", "MONITOR")).toBeNull();
    expect(nextRiskStatus("CLOSED", "ANALYZE")).toBeNull();
    expect(nextRiskStatus("CANCELLED", "PLAN")).toBeNull();
  });

  it("cobre todos os status declarados", () => {
    for (const status of RISK_STATUSES) {
      expect(RISK_TRANSITIONS[status]).toBeDefined();
      expect(Array.isArray(availableRiskActions(status))).toBe(true);
    }
    expect(availableRiskActions("IDENTIFIED").sort()).toEqual(["ANALYZE", "CANCEL"]);
    expect(availableRiskActions("MONITORING").sort()).toEqual([
      "CANCEL",
      "CLOSE",
      "TREAT",
    ]);
  });

  it("classifica status terminal vs aberto", () => {
    expect(isRiskTerminal("CLOSED")).toBe(true);
    expect(isRiskTerminal("CANCELLED")).toBe(true);
    expect(isRiskTerminal("TREATING")).toBe(false);
    expect(isRiskOpen("IDENTIFIED")).toBe(true);
    expect(isRiskOpen("CLOSED")).toBe(false);
  });
});
