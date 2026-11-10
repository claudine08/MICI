// Motor de reuniões/atas (Onda 4, §20): máquina de estados pura + constantes.
// Sem I/O.

export const MEETING_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "CANCELLED"] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const MEETING_STATUS_LABELS_PT: Record<MeetingStatus, string> = {
  DRAFT: "Rascunho",
  SUBMITTED: "Submetida",
  APPROVED: "Aprovada",
  CANCELLED: "Cancelada",
};

export const MEETING_ACTIONS = ["SUBMIT", "APPROVE", "CANCEL", "REOPEN"] as const;
export type MeetingAction = (typeof MEETING_ACTIONS)[number];

export function isMeetingEditable(status: MeetingStatus): boolean {
  return status === "DRAFT";
}

export interface MeetingTransitionInput {
  currentStatus: MeetingStatus;
  action: MeetingAction;
}

export function nextMeetingStatus(
  input: MeetingTransitionInput
): { nextStatus: MeetingStatus } | { error: string } {
  const { currentStatus, action } = input;
  switch (action) {
    case "SUBMIT":
      if (currentStatus !== "DRAFT") {
        return { error: `Submissão exige status 'Rascunho', atual é '${MEETING_STATUS_LABELS_PT[currentStatus]}'.` };
      }
      return { nextStatus: "SUBMITTED" };
    case "APPROVE":
      if (currentStatus !== "SUBMITTED") {
        return { error: `Aprovação exige status 'Submetida'.` };
      }
      return { nextStatus: "APPROVED" };
    case "CANCEL":
      if (currentStatus === "APPROVED") {
        return { error: "Ata aprovada não pode ser cancelada." };
      }
      if (currentStatus === "CANCELLED") {
        return { error: "Ata já está cancelada." };
      }
      return { nextStatus: "CANCELLED" };
    case "REOPEN":
      if (currentStatus !== "CANCELLED") {
        return { error: "Apenas atas canceladas podem ser reabertas." };
      }
      return { nextStatus: "DRAFT" };
    default:
      return { error: `Ação desconhecida: ${action}` };
  }
}