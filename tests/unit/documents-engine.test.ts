import { describe, expect, it } from "vitest";
import {
  DOCUMENT_TRANSITIONS,
  nextDocumentStatus,
  canCreateRevision,
  canEditMetadata,
  canDeleteDocument,
  nextRevisionNumber,
  type DocumentStatusValue,
} from "@/modules/documents/engine";

// Motor de documentos (E09, §36): máquina de estados pura e regras BR-009.

describe("DOCUMENT_TRANSITIONS", () => {
  it("cobre a cadeia WIP → FOR_REVIEW → APPROVED → RELEASED_FOR_EXECUTION", () => {
    expect(nextDocumentStatus("SUBMIT", "WIP")).toBe("FOR_REVIEW");
    expect(nextDocumentStatus("APPROVE", "FOR_REVIEW")).toBe("APPROVED");
    expect(nextDocumentStatus("RELEASE", "APPROVED")).toBe("RELEASED_FOR_EXECUTION");
  });

  it("REJECT volta a FOR_REVIEW → WIP", () => {
    expect(nextDocumentStatus("REJECT", "FOR_REVIEW")).toBe("WIP");
  });

  it("OBSOLETE aceita FOR_REVIEW, APPROVED e RELEASED_FOR_EXECUTION", () => {
    expect(nextDocumentStatus("OBSOLETE", "FOR_REVIEW")).toBe("OBSOLETE");
    expect(nextDocumentStatus("OBSOLETE", "APPROVED")).toBe("OBSOLETE");
    expect(nextDocumentStatus("OBSOLETE", "RELEASED_FOR_EXECUTION")).toBe("OBSOLETE");
  });

  it("rejeita transições inválidas (null)", () => {
    expect(nextDocumentStatus("SUBMIT", "FOR_REVIEW")).toBeNull();
    expect(nextDocumentStatus("APPROVE", "WIP")).toBeNull();
    expect(nextDocumentStatus("RELEASE", "FOR_REVIEW")).toBeNull();
    expect(nextDocumentStatus("RELEASE", "WIP")).toBeNull();
    expect(nextDocumentStatus("REJECT", "WIP")).toBeNull();
    expect(nextDocumentStatus("OBSOLETE", "WIP")).toBeNull();
    expect(nextDocumentStatus("SUBMIT", "OBSOLETE")).toBeNull();
  });

  it("toda ação tem from/to coerentes com o destino", () => {
    for (const [action, rule] of Object.entries(DOCUMENT_TRANSITIONS)) {
      expect(rule.from.length, action).toBeGreaterThan(0);
      expect(rule.to, action).toBeTruthy();
      expect(rule.from, action).not.toContain(rule.to);
    }
  });
});

describe("regras de arquivo (BR-009)", () => {
  it("canCreateRevision: só APPROVED/RELEASED/OBSOLETE", () => {
    expect(canCreateRevision("APPROVED")).toBe(true);
    expect(canCreateRevision("RELEASED_FOR_EXECUTION")).toBe(true);
    expect(canCreateRevision("OBSOLETE")).toBe(true);
    expect(canCreateRevision("WIP")).toBe(false);
    expect(canCreateRevision("FOR_REVIEW")).toBe(false);
  });

  it("canEditMetadata: só estados de trabalho", () => {
    expect(canEditMetadata("WIP")).toBe(true);
    expect(canEditMetadata("FOR_REVIEW")).toBe(true);
    expect(canEditMetadata("APPROVED")).toBe(false);
    expect(canEditMetadata("RELEASED_FOR_EXECUTION")).toBe(false);
    expect(canEditMetadata("OBSOLETE")).toBe(false);
  });

  it("canDeleteDocument: liberado e aprovado nunca são apagados (BR-010)", () => {
    expect(canDeleteDocument("WIP")).toBe(true);
    expect(canDeleteDocument("FOR_REVIEW")).toBe(true);
    expect(canDeleteDocument("OBSOLETE")).toBe(true);
    expect(canDeleteDocument("APPROVED")).toBe(false);
    expect(canDeleteDocument("RELEASED_FOR_EXECUTION")).toBe(false);
  });

  it("nextRevisionNumber incrementa sempre", () => {
    expect(nextRevisionNumber(1)).toBe(2);
    expect(nextRevisionNumber(7)).toBe(8);
  });

  it("cobertura: todos os status têm regras definidas", () => {
    const statuses: DocumentStatusValue[] = [
      "WIP",
      "FOR_REVIEW",
      "APPROVED",
      "RELEASED_FOR_EXECUTION",
      "OBSOLETE",
    ];
    for (const status of statuses) {
      expect(typeof canCreateRevision(status)).toBe("boolean");
      expect(typeof canEditMetadata(status)).toBe("boolean");
      expect(typeof canDeleteDocument(status)).toBe("boolean");
    }
  });
});
