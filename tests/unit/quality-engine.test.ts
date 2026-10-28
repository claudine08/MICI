// Testes do motor de qualidade puro (E13, §33/§34): mquinas de estados
// da inspecao e da execucao de checklist, resumo de itens, evidencia e
// quadro de qualidade. Sem I/O — puro.

import { describe, expect, it } from "vitest";
import {
  CHECKLIST_EXECUTION_STATUSES,
  CHECKLIST_EXECUTION_TRANSITIONS,
  CORRECTIVE_ACTION_STATUSES,
  CORRECTIVE_ACTION_TRANSITIONS,
  INSPECTION_STATUSES,
  INSPECTION_TRANSITIONS,
  NON_CONFORMITY_STATUSES,
  NON_CONFORMITY_TRANSITIONS,
  availableChecklistExecutionActions,
  availableCorrectiveActionActions,
  availableInspectionActions,
  availableNonConformityActions,
  inspectionHasEvidence,
  isChecklistExecutionEditable,
  isChecklistExecutionTerminal,
  isCorrectiveActionEditable,
  isCorrectiveActionOpen,
  isInspectionEditable,
  isInspectionOpen,
  isInspectionTerminal,
  isNonConformityEditable,
  isNonConformityOpen,
  isNonConformityResolved,
  isValidTemplateItems,
  nextChecklistExecutionStatus,
  nextCorrectiveActionStatus,
  nextInspectionStatus,
  nextNonConformityStatus,
  parseChecklistItems,
  summarizeChecklistItems,
  summarizeQualityBoard,
} from "@/modules/quality/engine";

const items = [
  { key: "i1", text: "Nivelamento", required: true },
  { key: "i2", text: "Fotografia do conjunto", required: false },
];

describe("maquina de estados da inspecao (E13-US02, §33)", () => {
  it("fluxo feliz PLANNED → EXECUTED → PASSED → CLOSED", () => {
    expect(nextInspectionStatus("PLANNED", "EXECUTE")).toBe("EXECUTED");
    expect(nextInspectionStatus("EXECUTED", "PASS")).toBe("PASSED");
    expect(nextInspectionStatus("PASSED", "CLOSE")).toBe("CLOSED");
    expect(availableInspectionActions("PLANNED")).toEqual(["EXECUTE", "CANCEL"]);
    expect(availableInspectionActions("EXECUTED")).toEqual(["PASS", "FAIL", "CANCEL"]);
  });

  it("reprovacao segue o mesmo caminho e fecha depois", () => {
    expect(nextInspectionStatus("EXECUTED", "FAIL")).toBe("FAILED");
    expect(nextInspectionStatus("FAILED", "CLOSE")).toBe("CLOSED");
    // Fatia 2: CLOSE em FAILED passar a exigir NCR encerrado (§33).
    expect(nextInspectionStatus("FAILED", "REOPEN")).toBe("EXECUTED");
  });

  it("no salta de PLANNED para PASS/FAIL", () => {
    expect(nextInspectionStatus("PLANNED", "PASS")).toBeNull();
    expect(nextInspectionStatus("PLANNED", "FAIL")).toBeNull();
    expect(nextInspectionStatus("PLANNED", "CLOSE")).toBeNull();
  });

  it("CLOSED  terminal; CANCELLED volta a PLANNED", () => {
    expect(availableInspectionActions("CLOSED")).toEqual([]);
    expect(isInspectionTerminal("CLOSED")).toBe(true);
    expect(nextInspectionStatus("CANCELLED", "REOPEN")).toBe("PLANNED");
    expect(isInspectionTerminal("CANCELLED")).toBe(true);
  });

  it("edita somente PLANNED e EXECUTED; aberta  o que no  terminal", () => {
    expect(isInspectionEditable("PLANNED")).toBe(true);
    expect(isInspectionEditable("EXECUTED")).toBe(true);
    expect(isInspectionEditable("PASSED")).toBe(false);
    expect(isInspectionEditable("FAILED")).toBe(false);
    expect(isInspectionOpen("PASSED")).toBe(true);
    expect(isInspectionOpen("CLOSED")).toBe(false);
    expect(isInspectionOpen("CANCELLED")).toBe(false);
  });

  it("toda entrada da tabela tem transies declaradas", () => {
    for (const status of INSPECTION_STATUSES) {
      expect(INSPECTION_TRANSITIONS[status]).toBeDefined();
    }
    expect(INSPECTION_TRANSITIONS.CLOSED).toEqual({});
  });
});

describe("maquina de estados da execucao de checklist (E13-US01)", () => {
  it("DRAFT conclui ou cancela; COMPLETED/CANCELLED voltam via REOPEN", () => {
    expect(nextChecklistExecutionStatus("DRAFT", "COMPLETE")).toBe("COMPLETED");
    expect(nextChecklistExecutionStatus("DRAFT", "CANCEL")).toBe("CANCELLED");
    expect(nextChecklistExecutionStatus("COMPLETED", "REOPEN")).toBe("DRAFT");
    expect(nextChecklistExecutionStatus("CANCELLED", "REOPEN")).toBe("DRAFT");
    expect(nextChecklistExecutionStatus("COMPLETED", "COMPLETE")).toBeNull();
  });

  it("s rascunho  editvel e o que  terminal no tem aces", () => {
    expect(isChecklistExecutionEditable("DRAFT")).toBe(true);
    expect(isChecklistExecutionEditable("COMPLETED")).toBe(false);
    expect(isChecklistExecutionTerminal("COMPLETED")).toBe(true);
    expect(isChecklistExecutionTerminal("DRAFT")).toBe(false);
    expect(availableChecklistExecutionActions("COMPLETED")).toEqual(["REOPEN"]);
    for (const status of CHECKLIST_EXECUTION_STATUSES) {
      expect(CHECKLIST_EXECUTION_TRANSITIONS[status]).toBeDefined();
    }
  });
});

describe("maquina de estados da nao conformidade - NCR (E13-US03, §33)", () => {
  it("fluxo feliz OPEN → CORRECTION → VERIFICATION → CLOSED", () => {
    expect(nextNonConformityStatus("OPEN", "START")).toBe("CORRECTION");
    expect(nextNonConformityStatus("CORRECTION", "SUBMIT")).toBe("VERIFICATION");
    expect(nextNonConformityStatus("VERIFICATION", "VERIFY")).toBe("CLOSED");
    expect(availableNonConformityActions("OPEN")).toEqual(["START", "CANCEL"]);
    expect(availableNonConformityActions("CORRECTION")).toEqual(["SUBMIT", "CANCEL"]);
    expect(availableNonConformityActions("VERIFICATION")).toEqual(["VERIFY", "REJECT", "CANCEL"]);
  });

  it("reprovacao da verificacao volta para correcao", () => {
    expect(nextNonConformityStatus("VERIFICATION", "REJECT")).toBe("CORRECTION");
    expect(nextNonConformityStatus("CORRECTION", "REJECT")).toBeNull();
    expect(nextNonConformityStatus("OPEN", "VERIFY")).toBeNull();
  });

  it("REOPEN reabre encerrada em verificacao e cancelada em aberta", () => {
    expect(nextNonConformityStatus("CLOSED", "REOPEN")).toBe("VERIFICATION");
    expect(nextNonConformityStatus("CANCELLED", "REOPEN")).toBe("OPEN");
    expect(availableNonConformityActions("CLOSED")).toEqual(["REOPEN"]);
  });

  it("CANCEL so existe antes do encerramento", () => {
    expect(nextNonConformityStatus("OPEN", "CANCEL")).toBe("CANCELLED");
    expect(nextNonConformityStatus("CORRECTION", "CANCEL")).toBe("CANCELLED");
    expect(nextNonConformityStatus("VERIFICATION", "CANCEL")).toBe("CANCELLED");
    expect(nextNonConformityStatus("CLOSED", "CANCEL")).toBeNull();
  });

  it("edita em OPEN/CORRECTION; aberta exclui CLOSED/CANCELLED; resolvida exige terminal", () => {
    expect(isNonConformityEditable("OPEN")).toBe(true);
    expect(isNonConformityEditable("CORRECTION")).toBe(true);
    expect(isNonConformityEditable("VERIFICATION")).toBe(false);
    expect(isNonConformityOpen("VERIFICATION")).toBe(true);
    expect(isNonConformityOpen("CLOSED")).toBe(false);
    expect(isNonConformityOpen("CANCELLED")).toBe(false);
    expect(isNonConformityResolved("CLOSED")).toBe(true);
    expect(isNonConformityResolved("CANCELLED")).toBe(true);
    expect(isNonConformityResolved("VERIFICATION")).toBe(false);
  });

  it("toda entrada da tabela tem transies declaradas", () => {
    for (const status of NON_CONFORMITY_STATUSES) {
      expect(NON_CONFORMITY_TRANSITIONS[status]).toBeDefined();
    }
    expect(Object.keys(NON_CONFORMITY_TRANSITIONS.CLOSED)).toEqual(["REOPEN"]);
  });
});

describe("maquina de estados da acao corretiva (E13-US04, §33)", () => {
  it("fluxo feliz OPEN → IN_PROGRESS → DONE → VERIFIED → CLOSED", () => {
    expect(nextCorrectiveActionStatus("OPEN", "START")).toBe("IN_PROGRESS");
    expect(nextCorrectiveActionStatus("IN_PROGRESS", "COMPLETE")).toBe("DONE");
    expect(nextCorrectiveActionStatus("DONE", "VERIFY")).toBe("VERIFIED");
    expect(nextCorrectiveActionStatus("VERIFIED", "CLOSE")).toBe("CLOSED");
    expect(availableCorrectiveActionActions("OPEN")).toEqual(["START", "CANCEL"]);
    expect(availableCorrectiveActionActions("IN_PROGRESS")).toEqual(["COMPLETE", "CANCEL"]);
  });

  it("reprovacao volta de DONE e de VERIFIED para IN_PROGRESS", () => {
    expect(nextCorrectiveActionStatus("DONE", "REJECT")).toBe("IN_PROGRESS");
    expect(nextCorrectiveActionStatus("VERIFIED", "REJECT")).toBe("IN_PROGRESS");
    expect(nextCorrectiveActionStatus("IN_PROGRESS", "VERIFY")).toBeNull();
    expect(nextCorrectiveActionStatus("OPEN", "CLOSE")).toBeNull();
  });

  it("REOPEN volta encerrada para verificacao e cancelada para aberta", () => {
    expect(nextCorrectiveActionStatus("CLOSED", "REOPEN")).toBe("VERIFIED");
    expect(nextCorrectiveActionStatus("CANCELLED", "REOPEN")).toBe("OPEN");
    expect(availableCorrectiveActionActions("CLOSED")).toEqual(["REOPEN"]);
  });

  it("edita em OPEN/IN_PROGRESS; aberta no terminal", () => {
    expect(isCorrectiveActionEditable("OPEN")).toBe(true);
    expect(isCorrectiveActionEditable("IN_PROGRESS")).toBe(true);
    expect(isCorrectiveActionEditable("DONE")).toBe(false);
    expect(isCorrectiveActionOpen("DONE")).toBe(true);
    expect(isCorrectiveActionOpen("VERIFIED")).toBe(true);
    expect(isCorrectiveActionOpen("CLOSED")).toBe(false);
    expect(isCorrectiveActionOpen("CANCELLED")).toBe(false);
  });

  it("toda entrada da tabela tem transies declaradas", () => {
    for (const status of CORRECTIVE_ACTION_STATUSES) {
      expect(CORRECTIVE_ACTION_TRANSITIONS[status]).toBeDefined();
    }
    expect(Object.keys(CORRECTIVE_ACTION_TRANSITIONS.CLOSED)).toEqual(["REOPEN"]);
  });
});

describe("itens de checklist e critrio de concluso (§33)", () => {
  it("considera completo quando todos os obrigatrios tm resposta", () => {
    const pending = summarizeChecklistItems(parseChecklistItems(items));
    expect(pending.total).toBe(2);
    expect(pending.required).toBe(1);
    expect(pending.answered).toBe(0);
    expect(pending.complete).toBe(false);

    const complete = summarizeChecklistItems([
      { ...items[0], result: "NA" },
      { ...items[1], result: "PASS" },
    ]);
    expect(complete.complete).toBe(true);
    expect(complete.notApplicable).toBe(1);
    expect(complete.passed).toBe(1);
  });

  it("conclui pelo obrigatrio mesmo com o opcional ainda pendente", () => {
    const summary = summarizeChecklistItems([
      { ...items[0], result: "PASS" },
      { ...items[1], result: null },
    ]);
    expect(summary.requiredAnswered).toBe(1);
    expect(summary.answered).toBe(1);
    expect(summary.complete).toBe(true);
  });

  it("qualquer item NO CONFORME marca a falha do conjunto", () => {
    const summary = summarizeChecklistItems([
      { ...items[0], result: "FAIL", note: "desvio" },
      { ...items[1], result: "PASS" },
    ]);
    expect(summary.hasFailure).toBe(true);
    expect(summary.failed).toBe(1);
  });

  it("lista vazia no  vlida como modelo nem como concluso", () => {
    expect(isValidTemplateItems([])).toBe(false);
    expect(isValidTemplateItems([{ key: "i1", text: "   ", required: true }])).toBe(false);
    expect(isValidTemplateItems(items)).toBe(true);
    expect(summarizeChecklistItems([]).complete).toBe(false);
  });

  it("parse ignora entradas malformadas", () => {
    expect(parseChecklistItems(null)).toEqual([]);
    expect(parseChecklistItems("nope")).toEqual([]);
    expect(parseChecklistItems([...items, { text: "sem key" }])).toHaveLength(2);
  });
});

describe("evidncia da inspeo (§33 'evidncia adequada')", () => {
  it("exige foto ou checklist concludo antes de PASS/FAIL", () => {
    expect(inspectionHasEvidence({ photoCount: 0, completedChecklists: 0 })).toBe(false);
    expect(inspectionHasEvidence({ photoCount: 1, completedChecklists: 0 })).toBe(true);
    expect(inspectionHasEvidence({ photoCount: 0, completedChecklists: 1 })).toBe(true);
  });
});

describe("quadro de qualidade", () => {
  it("conta modelos, execues pendentes e inspees por status", () => {
    const board = summarizeQualityBoard({
      templates: [{ id: "1" }, { id: "2" }],
      executions: [
        { status: "DRAFT" },
        { status: "DRAFT" },
        { status: "COMPLETED" },
      ],
      inspections: [
        { status: "PLANNED" },
        { status: "EXECUTED" },
        { status: "PASSED" },
        { status: "FAILED" },
        { status: "CLOSED" },
        { status: "CANCELLED" },
      ],
    });

    expect(board.templates).toBe(2);
    expect(board.executions).toBe(3);
    expect(board.executionsPending).toBe(2);
    expect(board.inspections).toBe(6);
    expect(board.planned).toBe(1);
    expect(board.executed).toBe(1);
    expect(board.passed).toBe(1);
    expect(board.failed).toBe(1);
    expect(board.closed).toBe(1);
    expect(board.open).toBe(4);
    expect(board.nonConformities).toBe(0);
    expect(board.correctiveActions).toBe(0);
  });

  it("conta NCR e acoes corretivas, abertas fora de CLOSED/CANCELLED", () => {
    const board = summarizeQualityBoard({
      templates: [],
      executions: [],
      inspections: [],
      nonConformities: [
        { status: "OPEN" },
        { status: "CORRECTION" },
        { status: "VERIFICATION" },
        { status: "CLOSED" },
        { status: "CANCELLED" },
      ],
      correctiveActions: [
        { status: "OPEN" },
        { status: "DONE" },
        { status: "CLOSED" },
      ],
    });

    expect(board.nonConformities).toBe(5);
    expect(board.nonConformitiesOpen).toBe(3);
    expect(board.correctiveActions).toBe(3);
    expect(board.correctiveActionsOpen).toBe(2);
  });
});
