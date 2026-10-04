import { describe, expect, it } from "vitest";
import {
  PROJECT_PHASES,
  nextPhase,
  prevPhase,
  isValidPhase,
  gateTransition,
  actionsForStatus,
  approveBlocks,
  pendingBlockingGates,
  type CriterionSnapshot,
} from "@/modules/gates/engine";

// Motor puro de gates/fases — BR-001, BR-002 e máquina de estados (§16.3/§17).

describe("fases do projeto", () => {
  it("avança e retorna dentro do intervalo F0–F10", () => {
    expect(nextPhase("F0")).toBe("F1");
    expect(nextPhase("F9")).toBe("F10");
    expect(prevPhase("F10")).toBe("F9");
    expect(prevPhase("F1")).toBe("F0");
  });

  it("limites: F10 não avança, F1 não retorna", () => {
    expect(nextPhase("F10")).toBeNull();
    expect(prevPhase("F0")).toBeNull();
    expect(nextPhase("XX")).toBeNull();
    expect(prevPhase("XX")).toBeNull();
  });

  it("valida códigos de fase", () => {
    expect(isValidPhase("F5")).toBe(true);
    expect(isValidPhase("F11")).toBe(false);
    expect(PROJECT_PHASES).toHaveLength(11);
  });
});

describe("máquina de estados do gate (§16.3)", () => {
  it("fluxo feliz completo", () => {
    expect(gateTransition("start", "NOT_STARTED")).toBe("IN_PROGRESS");
    expect(gateTransition("submit", "IN_PROGRESS")).toBe("SUBMITTED");
    expect(gateTransition("analyze", "SUBMITTED")).toBe("UNDER_REVIEW");
    expect(gateTransition("approve", "UNDER_REVIEW")).toBe("APPROVED");
    expect(gateTransition("reject", "UNDER_REVIEW")).toBe("REJECTED");
  });

  it("rejeita transições arbitrárias", () => {
    expect(gateTransition("start", "IN_PROGRESS")).toBeNull();
    expect(gateTransition("approve", "IN_PROGRESS")).toBeNull();
    expect(gateTransition("approve", "NOT_STARTED")).toBeNull();
    expect(gateTransition("submit", "APPROVED")).toBeNull();
    expect(gateTransition("approve", "WAIVED")).toBeNull();
  });

  it("dispensa é permitida de estados não terminais, inclusive rejeitado", () => {
    expect(gateTransition("waive", "NOT_STARTED")).toBe("WAIVED");
    expect(gateTransition("waive", "REJECTED")).toBe("WAIVED");
    expect(gateTransition("waive", "APPROVED")).toBeNull();
    expect(gateTransition("waive", "WAIVED")).toBeNull();
  });

  it("ações disponíveis por status", () => {
    expect(actionsForStatus("NOT_STARTED")).toEqual(["start", "waive"]);
    expect(actionsForStatus("UNDER_REVIEW")).toEqual(["approve", "reject", "waive"]);
    expect(actionsForStatus("APPROVED")).toEqual([]);
  });
});

describe("BR-002 — checagens de aprovação", () => {
  const snapshot: CriterionSnapshot[] = [
    { code: "C1", description: "Critério 1", required: true, orderIndex: 0 },
    { code: "C2", description: "Critério 2", required: true, orderIndex: 1 },
    { code: "C3", description: "Opcional", required: false, orderIndex: 2 },
  ];

  it("aprova quando critérios obrigatórios completos + evidência presente", () => {
    const blocks = approveBlocks({
      snapshot,
      completedCodes: new Set(["C1", "C2"]),
      evidenceCount: 1,
      requiresEvidence: true,
    });
    expect(blocks).toEqual([]);
  });

  it("bloqueia com critério obrigatório pendente (E06-US05)", () => {
    const blocks = approveBlocks({
      snapshot,
      completedCodes: new Set(["C1"]),
      evidenceCount: 1,
      requiresEvidence: true,
    });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toBe("GATE_CRITERIA_PENDING");
    expect(blocks[0].pendingCriteria).toEqual(["C2"]);
  });

  it("critério opcional pendente não bloqueia", () => {
    const blocks = approveBlocks({
      snapshot,
      completedCodes: new Set(["C1", "C2"]),
      evidenceCount: 1,
      requiresEvidence: false,
    });
    expect(blocks).toEqual([]);
  });

  it("bloqueia sem evidência quando obrigatória (BR-002)", () => {
    const blocks = approveBlocks({
      snapshot,
      completedCodes: new Set(["C1", "C2"]),
      evidenceCount: 0,
      requiresEvidence: true,
    });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toBe("GATE_EVIDENCE_REQUIRED");
  });

  it("sem exigência de evidência, aprova sem evidências", () => {
    const blocks = approveBlocks({
      snapshot,
      completedCodes: new Set(["C1", "C2"]),
      evidenceCount: 0,
      requiresEvidence: false,
    });
    expect(blocks).toEqual([]);
  });

  it("acumula múltiplos bloqueios", () => {
    const blocks = approveBlocks({
      snapshot,
      completedCodes: new Set(),
      evidenceCount: 0,
      requiresEvidence: true,
    });
    expect(blocks.map((block) => block.code)).toEqual([
      "GATE_CRITERIA_PENDING",
      "GATE_EVIDENCE_REQUIRED",
    ]);
  });
});

describe("BR-001 — gates pendentes bloqueiam avanço", () => {
  it("APPROVED e WAIVED liberam; demais bloqueiam", () => {
    const pending = pendingBlockingGates([
      { code: "G0", name: "Oportunidade", status: "APPROVED" },
      { code: "G1", name: "Requisitos", status: "WAIVED" },
      { code: "G2", name: "Viabilidade", status: "REJECTED" },
      { code: "G3", name: "Proposta", status: "NOT_STARTED" },
      { code: "G4", name: "Contrato", status: "UNDER_REVIEW" },
    ]);
    expect(pending.map((gate) => gate.code)).toEqual(["G2", "G3", "G4"]);
  });

  it("lista vazia não bloqueia", () => {
    expect(pendingBlockingGates([])).toEqual([]);
  });
});
