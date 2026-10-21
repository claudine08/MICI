// Testes do motor de mudanças puro (E11 §31): workflow obrigatório
// DRAFT → … → CLOSED, ações disponíveis, estados terminais e severidade
// consolidada das dimensões de impacto.

import { describe, expect, it } from "vitest";
import {
  CHANGE_DIMENSIONS,
  CHANGE_STATUSES,
  CHANGE_TRANSITIONS,
  availableChangeActions,
  isApprovalAction,
  isChangeEditable,
  isChangeOpen,
  isChangeTerminal,
  isRejectionAction,
  nextChangeStatus,
  overallImpactSeverity,
  type ChangeStatus,
} from "@/modules/change/engine";

describe("workflow do change control (§31)", () => {
  it("segue o caminho obrigatório DRAFT → SUBMITTED → IMPACT_ANALYSIS → WAITING_APPROVAL", () => {
    expect(nextChangeStatus("DRAFT", "SUBMIT")).toBe("SUBMITTED");
    expect(nextChangeStatus("SUBMITTED", "START_ANALYSIS")).toBe("IMPACT_ANALYSIS");
    expect(nextChangeStatus("IMPACT_ANALYSIS", "REQUEST_APPROVAL")).toBe("WAITING_APPROVAL");
  });

  it("aprova ou rejeita a partir de WAITING_APPROVAL e só implementa aprovada", () => {
    expect(nextChangeStatus("WAITING_APPROVAL", "APPROVE")).toBe("APPROVED");
    expect(nextChangeStatus("WAITING_APPROVAL", "REJECT")).toBe("REJECTED");
    expect(nextChangeStatus("APPROVED", "IMPLEMENT")).toBe("IMPLEMENTED");
    expect(nextChangeStatus("IMPLEMENTED", "VERIFY")).toBe("VERIFIED");
    expect(nextChangeStatus("VERIFIED", "CLOSE")).toBe("CLOSED");
  });

  it("cancela apenas antes da aprovação", () => {
    expect(nextChangeStatus("DRAFT", "CANCEL")).toBe("CANCELLED");
    expect(nextChangeStatus("SUBMITTED", "CANCEL")).toBe("CANCELLED");
    expect(nextChangeStatus("IMPACT_ANALYSIS", "CANCEL")).toBe("CANCELLED");
    expect(nextChangeStatus("WAITING_APPROVAL", "CANCEL")).toBeNull();
    expect(nextChangeStatus("APPROVED", "CANCEL")).toBeNull();
  });

  it("REJECTED e CLOSED não têm saída (exceto fluxo já encerrado)", () => {
    expect(availableChangeActions("REJECTED")).toEqual([]);
    expect(availableChangeActions("CLOSED")).toEqual([]);
    expect(availableChangeActions("CANCELLED")).toEqual([]);
  });

  it("não pula etapas do workflow", () => {
    expect(nextChangeStatus("DRAFT", "APPROVE")).toBeNull();
    expect(nextChangeStatus("DRAFT", "IMPLEMENT")).toBeNull();
    expect(nextChangeStatus("SUBMITTED", "APPROVE")).toBeNull();
    expect(nextChangeStatus("IMPACT_ANALYSIS", "APPROVE")).toBeNull();
    expect(nextChangeStatus("APPROVED", "VERIFY")).toBeNull();
    expect(nextChangeStatus("IMPLEMENTED", "CLOSE")).toBeNull();
  });
});

describe("availableChangeActions", () => {
  it("lista as ações legítimas por status", () => {
    expect(availableChangeActions("DRAFT").sort()).toEqual(["CANCEL", "SUBMIT"]);
    expect(availableChangeActions("SUBMITTED").sort()).toEqual(["CANCEL", "START_ANALYSIS"]);
    expect(availableChangeActions("IMPACT_ANALYSIS").sort()).toEqual([
      "CANCEL",
      "REQUEST_APPROVAL",
    ]);
    expect(availableChangeActions("WAITING_APPROVAL").sort()).toEqual(["APPROVE", "REJECT"]);
    expect(availableChangeActions("APPROVED")).toEqual(["IMPLEMENT"]);
    expect(availableChangeActions("IMPLEMENTED")).toEqual(["VERIFY"]);
    expect(availableChangeActions("VERIFIED")).toEqual(["CLOSE"]);
  });

  it("toda transição definida leva a um status válido", () => {
    for (const status of CHANGE_STATUSES) {
      for (const action of availableChangeActions(status)) {
        expect(CHANGE_STATUSES).toContain(nextChangeStatus(status, action)!);
      }
    }
  });
});

describe("isChangeTerminal / isChangeOpen / isChangeEditable", () => {
  it("terminais são REJECTED, CLOSED e CANCELLED", () => {
    expect(isChangeTerminal("REJECTED")).toBe(true);
    expect(isChangeTerminal("CLOSED")).toBe(true);
    expect(isChangeTerminal("CANCELLED")).toBe(true);
    expect(isChangeTerminal("APPROVED")).toBe(false);
    expect(isChangeTerminal("IMPLEMENTED")).toBe(false);
  });

  it("aberto é o complemento do terminal", () => {
    for (const status of CHANGE_STATUSES) {
      expect(isChangeOpen(status)).toBe(!isChangeTerminal(status));
    }
  });

  it("editável apenas em DRAFT e IMPACT_ANALYSIS (BR-004)", () => {
    expect(isChangeEditable("DRAFT")).toBe(true);
    expect(isChangeEditable("IMPACT_ANALYSIS")).toBe(true);
    expect(isChangeEditable("SUBMITTED")).toBe(false);
    expect(isChangeEditable("WAITING_APPROVAL")).toBe(false);
    expect(isChangeEditable("APPROVED")).toBe(false);
    expect(isChangeEditable("CLOSED")).toBe(false);
  });
});

describe("classificação de ações (permissões na API)", () => {
  it("APPROVE usa CHANGE:APPROVE e REJECT usa CHANGE:REJECT", () => {
    expect(isApprovalAction("APPROVE")).toBe(true);
    expect(isApprovalAction("SUBMIT")).toBe(false);
    expect(isRejectionAction("REJECT")).toBe(true);
    expect(isRejectionAction("APPROVE")).toBe(false);
  });
});

describe("overallImpactSeverity", () => {
  it("retorna a maior severidade entre as dimensões avaliadas", () => {
    expect(overallImpactSeverity([])).toBe("NONE");
    expect(overallImpactSeverity(["LOW", "NONE"])).toBe("LOW");
    expect(overallImpactSeverity(["LOW", "MEDIUM", "HIGH"])).toBe("HIGH");
    expect(overallImpactSeverity(["CRITICAL", "LOW"])).toBe("CRITICAL");
    expect(overallImpactSeverity(["NONE", "NONE"])).toBe("NONE");
  });

  it("cobre as 11 dimensões da §31", () => {
    expect(CHANGE_DIMENSIONS).toHaveLength(11);
    expect(CHANGE_DIMENSIONS).toContain("SCOPE");
    expect(CHANGE_DIMENSIONS).toContain("ENVIRONMENTAL");
    expect(CHANGE_DIMENSIONS).toContain("SUSTAINABILITY");
  });
});

describe("CHANGE_TRANSITIONS cobre todos os status", () => {
  it("todos os status do enum têm entrada na máquina", () => {
    for (const status of CHANGE_STATUSES) {
      expect(CHANGE_TRANSITIONS[status]).toBeDefined();
    }
  });

  it("ações inválidas devolvem null", () => {
    const closed: ChangeStatus = "CLOSED";
    expect(nextChangeStatus(closed, "SUBMIT")).toBeNull();
    expect(nextChangeStatus(closed, "CANCEL")).toBeNull();
  });
});
