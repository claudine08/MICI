// Motor de documentos (E09, §36, BR-009): máquina de estados pura do
// documento + regras de revisão. Sem I/O — testável em unit.
//
// Modelo: criar documento já inclui o upload da revisão 1 (E09-US01).
// `currentRevision` começa em 1. BR-009 — documento liberado nunca é
// sobrescrito: mudanças em APPROVED/RELEASED/OBSOLETE exigem nova revisão
// (arquivo novo em linha separada; o anterior permanece imutável).

export type DocumentStatusValue =
  | "WIP"
  | "FOR_REVIEW"
  | "APPROVED"
  | "RELEASED_FOR_EXECUTION"
  | "OBSOLETE";

export type DocumentAction = "SUBMIT" | "APPROVE" | "REJECT" | "RELEASE" | "OBSOLETE";

// WIP → FOR_REVIEW → APPROVED → RELEASED_FOR_EXECUTION → OBSOLETE (§36).
export const DOCUMENT_TRANSITIONS: Record<
  DocumentAction,
  { from: DocumentStatusValue[]; to: DocumentStatusValue }
> = {
  SUBMIT: { from: ["WIP"], to: "FOR_REVIEW" },
  APPROVE: { from: ["FOR_REVIEW"], to: "APPROVED" },
  REJECT: { from: ["FOR_REVIEW"], to: "WIP" },
  RELEASE: { from: ["APPROVED"], to: "RELEASED_FOR_EXECUTION" },
  OBSOLETE: { from: ["FOR_REVIEW", "APPROVED", "RELEASED_FOR_EXECUTION"], to: "OBSOLETE" },
};

export function nextDocumentStatus(
  action: DocumentAction,
  current: DocumentStatusValue
): DocumentStatusValue | null {
  const rule = DOCUMENT_TRANSITIONS[action];
  return rule && rule.from.includes(current) ? rule.to : null;
}

// BR-009: nova revisão só a partir de estados já aprovados/liberados — o
// arquivo corrente não é sobrescrito, a nova revisão entra em linha separada
// e o documento volta a WIP para percorrer o fluxo de novo.
export function canCreateRevision(status: DocumentStatusValue): boolean {
  return status === "APPROVED" || status === "RELEASED_FOR_EXECUTION" || status === "OBSOLETE";
}

export function canEditMetadata(status: DocumentStatusValue): boolean {
  return status === "WIP" || status === "FOR_REVIEW";
}

// BR-010: exclusão só de estados não governados; aprovado/liberado exige
// obsolescência (que mantém o histórico).
export function canDeleteDocument(status: DocumentStatusValue): boolean {
  return status === "WIP" || status === "FOR_REVIEW" || status === "OBSOLETE";
}

// Nova revisão reinicia o documento em WIP com o número incrementado.
export function nextRevisionNumber(currentRevision: number): number {
  return currentRevision + 1;
}
