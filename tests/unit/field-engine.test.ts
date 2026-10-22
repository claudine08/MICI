// Testes do motor de campo puro (E12 §38/§26/§39): máquinas de estados
// do diário, da tarefa e da retrição, editabilidade, atrasos e o quadro
// Hoje/Esta semana/Atrasadas/Restrições.

import { describe, expect, it } from "vitest";
import {
  CONSTRAINT_STATUSES,
  CONSTRAINT_TRANSITIONS,
  DIARY_STATUSES,
  DIARY_TRANSITIONS,
  TASK_STATUSES,
  TASK_TRANSITIONS,
  availableConstraintActions,
  availableDiaryActions,
  availableTaskActions,
  isConstraintEditable,
  isConstraintOverdue,
  isConstraintTerminal,
  isDiaryEditable,
  isDiaryTerminal,
  isSameDiaryDate,
  isValidProgressPercent,
  isTaskEditable,
  isTaskOverdue,
  isTaskTerminal,
  nextConstraintStatus,
  nextDiaryStatus,
  nextTaskStatus,
  summarizeFieldBoard,
} from "@/modules/field/engine";

describe("mquina de estados do dirio (§26)", () => {
  it("leva DRAFT → SUBMITTED → APPROVED", () => {
    expect(nextDiaryStatus("DRAFT", "SUBMIT")).toBe("SUBMITTED");
    expect(nextDiaryStatus("SUBMITTED", "APPROVE")).toBe("APPROVED");
  });

  it("exige passar por SUBMITTED (não aprova rascunho)", () => {
    expect(nextDiaryStatus("DRAFT", "APPROVE")).toBeNull();
    expect(availableDiaryActions("DRAFT")).toEqual(["SUBMIT", "CANCEL"]);
  });

  it("REJECTED volta a DRAFT por REVISE", () => {
    expect(nextDiaryStatus("SUBMITTED", "REJECT")).toBe("REJECTED");
    expect(nextDiaryStatus("REJECTED", "REVISE")).toBe("DRAFT");
    expect(availableDiaryActions("REJECTED")).toEqual(["REVISE", "CANCEL"]);
  });

  it("APPROVED  terminal — s REOPEN existe (CANCELLED)", () => {
    expect(DIARY_STATUSES.every((status) => DIARY_TRANSITIONS[status] !== undefined)).toBe(true);
    expect(availableDiaryActions("APPROVED")).toEqual([]);
    expect(isDiaryTerminal("APPROVED")).toBe(true);
    expect(isDiaryTerminal("CANCELLED")).toBe(true);
    expect(isDiaryTerminal("DRAFT")).toBe(false);
    expect(nextDiaryStatus("CANCELLED", "REOPEN")).toBe("DRAFT");
  });

  it("edita apenas DRAFT e REJECTED", () => {
    expect(isDiaryEditable("DRAFT")).toBe(true);
    expect(isDiaryEditable("REJECTED")).toBe(true);
    expect(isDiaryEditable("SUBMITTED")).toBe(false);
    expect(isDiaryEditable("APPROVED")).toBe(false);
  });
});

describe("mquina de estados da tarefa de campo (E12-US03)", () => {
  it("fluxo feliz OPEN → IN_PROGRESS → DONE", () => {
    expect(nextTaskStatus("OPEN", "START")).toBe("IN_PROGRESS");
    expect(nextTaskStatus("IN_PROGRESS", "COMPLETE")).toBe("DONE");
  });

  it("BLOQUEIO e desbloqueio saem só de estados de execuo", () => {
    expect(nextTaskStatus("IN_PROGRESS", "BLOCK")).toBe("BLOCKED");
    expect(nextTaskStatus("BLOCKED", "UNBLOCK")).toBe("IN_PROGRESS");
    expect(nextTaskStatus("OPEN", "BLOCK")).toBeNull();
    expect(nextTaskStatus("BLOCKED", "COMPLETE")).toBeNull();
  });

  it("DONE/CANCELLED s voltam via REOPEN", () => {
    expect(availableTaskActions("DONE")).toEqual(["REOPEN"]);
    expect(availableTaskActions("CANCELLED")).toEqual(["REOPEN"]);
    expect(isTaskTerminal("DONE")).toBe(true);
    expect(isTaskTerminal("CANCELLED")).toBe(true);
    expect(isTaskTerminal("IN_PROGRESS")).toBe(false);
  });

  it("edita enquanto no terminal", () => {
    expect(isTaskEditable("OPEN")).toBe(true);
    expect(isTaskEditable("BLOCKED")).toBe(true);
    expect(isTaskEditable("DONE")).toBe(false);
    expect(isTaskEditable("CANCELLED")).toBe(false);
  });

  it("toda entrada da tabela tem ao menos uma transio", () => {
    for (const status of TASK_STATUSES) {
      expect(TASK_TRANSITIONS[status]).toBeDefined();
      expect(availableTaskActions(status).length).toBeGreaterThan(0);
    }
  });
});

describe("mquina de estados da retrição (§39)", () => {
  it("OPEN → ADDRESSED → REMOVED", () => {
    expect(nextConstraintStatus("OPEN", "ADDRESS")).toBe("ADDRESSED");
    expect(nextConstraintStatus("ADDRESSED", "REMOVE")).toBe("REMOVED");
  });

  it("no remove direto da identificao", () => {
    expect(nextConstraintStatus("OPEN", "REMOVE")).toBeNull();
    expect(availableConstraintActions("OPEN")).toEqual(["ADDRESS", "CANCEL"]);
  });

  it("REMOVED/CANCELLED so terminais com REOPEN", () => {
    expect(isConstraintTerminal("REMOVED")).toBe(true);
    expect(isConstraintTerminal("CANCELLED")).toBe(true);
    expect(isConstraintTerminal("OPEN")).toBe(false);
    expect(nextConstraintStatus("REMOVED", "REOPEN")).toBe("ADDRESSED");
    expect(nextConstraintStatus("CANCELLED", "REOPEN")).toBe("OPEN");
    expect(CONSTRAINT_STATUSES.every((status) => CONSTRAINT_TRANSITIONS[status])).toBe(true);
  });

  it("edita em OPEN e ADDRESSED", () => {
    expect(isConstraintEditable("OPEN")).toBe(true);
    expect(isConstraintEditable("ADDRESSED")).toBe(true);
    expect(isConstraintEditable("REMOVED")).toBe(false);
    expect(isConstraintEditable("CANCELLED")).toBe(false);
  });
});

describe("regras puras de campo", () => {
  it("tarefa atrasada s com prazo e no concluda", () => {
    expect(isTaskOverdue("OPEN", "2026-10-20", "2026-10-21")).toBe(true);
    expect(isTaskOverdue("OPEN", "2026-10-21", "2026-10-21")).toBe(false);
    expect(isTaskOverdue("OPEN", "2026-10-20", "2026-10-21") && isTaskEditable("OPEN")).toBe(true);
    expect(isTaskOverdue("DONE", "2026-10-20", "2026-10-21")).toBe(false);
    expect(isTaskOverdue("CANCELLED", "2026-10-20", "2026-10-21")).toBe(false);
    expect(isTaskOverdue("OPEN", null, "2026-10-21")).toBe(false);
  });

  it("retrição atrasada s enquanto no removida/cancelada", () => {
    expect(isConstraintOverdue("OPEN", "2026-10-20", "2026-10-21")).toBe(true);
    expect(isConstraintOverdue("ADDRESSED", "2026-10-20", "2026-10-21")).toBe(true);
    expect(isConstraintOverdue("REMOVED", "2026-10-20", "2026-10-21")).toBe(false);
    expect(isConstraintOverdue("CANCELLED", "2026-10-20", "2026-10-21")).toBe(false);
    expect(isConstraintOverdue("OPEN", null, "2026-10-21")).toBe(false);
  });

  it("valida percentual de avanço 0–100 (BR-006)", () => {
    expect(isValidProgressPercent(0)).toBe(true);
    expect(isValidProgressPercent(72.5)).toBe(true);
    expect(isValidProgressPercent(100)).toBe(true);
    expect(isValidProgressPercent(-1)).toBe(false);
    expect(isValidProgressPercent(101)).toBe(false);
    expect(isValidProgressPercent(Number.NaN)).toBe(false);
  });

  it("um dirio por data de obra", () => {
    expect(isSameDiaryDate("2026-10-21", "2026-10-21")).toBe(true);
    expect(isSameDiaryDate("2026-10-21", "2026-10-22")).toBe(false);
  });
});

describe("summarizeFieldBoard (home de campo, §38)", () => {
  const today = "2026-10-21";
  const weekEnd = "2026-10-25";

  const input = {
    diaryEntries: [
      { entryDate: "2026-10-21" },
      { entryDate: "2026-10-22" },
      { entryDate: "2026-10-25" },
      { entryDate: "2026-10-26" },
      { entryDate: "2026-10-19" },
    ],
    tasks: [
      { status: "OPEN" as const, dueDate: "2026-10-20" },
      { status: "OPEN" as const, dueDate: "2026-10-24" },
      { status: "OPEN" as const, dueDate: null },
      { status: "IN_PROGRESS" as const, dueDate: "2026-10-20" },
      { status: "DONE" as const, dueDate: "2026-10-20" },
      { status: "CANCELLED" as const, dueDate: "2026-10-20" },
    ],
    constraints: [
      { status: "OPEN" as const },
      { status: "ADDRESSED" as const },
      { status: "REMOVED" as const },
      { status: "CANCELLED" as const },
    ],
    today,
    weekEnd,
  };

  it("conta hoje, semana, atrasos e retrições abertas", () => {
    expect(summarizeFieldBoard(input)).toEqual({
      today: 1,
      thisWeek: 3,
      overdue: 2,
      openConstraints: 2,
    });
  });

  it("considera o prazo no passado mesmo ainda na semana", () => {
    const late = summarizeFieldBoard({
      ...input,
      diaryEntries: [],
      tasks: [{ status: "OPEN", dueDate: "2026-10-21" }],
      constraints: [],
    });
    expect(late.overdue).toBe(0);

    const stillLate = summarizeFieldBoard({
      ...input,
      diaryEntries: [],
      tasks: [{ status: "BLOCKED", dueDate: "2026-10-20" }],
      constraints: [],
    });
    expect(stillLate.overdue).toBe(1);
  });

  it("sem registros zera o quadro", () => {
    expect(
      summarizeFieldBoard({ diaryEntries: [], tasks: [], constraints: [], today, weekEnd })
    ).toEqual({ today: 0, thisWeek: 0, overdue: 0, openConstraints: 0 });
  });
});
