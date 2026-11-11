export const RFI_STATUSES = ["OPEN", "ANSWERED", "CLOSED", "CANCELLED"] as const;
export type RfiStatus = (typeof RFI_STATUSES)[number];

export const RFI_STATUS_LABELS_PT: Record<RfiStatus, string> = {
  OPEN: "Aberto",
  ANSWERED: "Respondido",
  CLOSED: "Encerrado",
  CANCELLED: "Cancelado",
};

export const RFI_ACTIONS = ["ANSWER", "CLOSE", "CANCEL", "REOPEN"] as const;
export type RfiAction = (typeof RFI_ACTIONS)[number];

export function isRfiOpen(status: RfiStatus): boolean {
  return status === "OPEN";
}

export interface RfiTransitionInput {
  currentStatus: RfiStatus;
  action: RfiAction;
  hasResponse?: boolean;
}

export function nextRfiStatus(
  input: RfiTransitionInput
): { nextStatus: RfiStatus } | { error: string } {
  const { currentStatus, action, hasResponse = false } = input;
  switch (action) {
    case "ANSWER":
      if (currentStatus !== "OPEN") return { error: "Apenas RFIs abertos podem ser respondidos." };
      if (!hasResponse) return { error: "Resposta é obrigatória para responder." };
      return { nextStatus: "ANSWERED" };
    case "CLOSE":
      if (currentStatus !== "ANSWERED") return { error: "Apenas RFIs respondidos podem ser encerrados." };
      return { nextStatus: "CLOSED" };
    case "CANCEL":
      if (currentStatus === "CLOSED") return { error: "RFI encerrado não pode ser cancelado." };
      if (currentStatus === "CANCELLED") return { error: "RFI já está cancelado." };
      return { nextStatus: "CANCELLED" };
    case "REOPEN":
      if (currentStatus !== "CANCELLED" && currentStatus !== "CLOSED") return { error: "Apenas RFIs cancelados/encerrados podem ser reabertos." };
      return { nextStatus: "OPEN" };
    default:
      return { error: `Ação desconhecida: ${action}` };
  }
}