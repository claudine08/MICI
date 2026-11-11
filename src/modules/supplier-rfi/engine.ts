export const SUPPLIER_RFI_STATUSES = ["DRAFT", "SENT", "RESPONDED", "SELECTED", "CONVERTED", "CANCELLED"] as const;
export type SupplierRfiStatus = (typeof SUPPLIER_RFI_STATUSES)[number];

export const SUPPLIER_RFI_STATUS_LABELS_PT: Record<SupplierRfiStatus, string> = {
  DRAFT: "Rascunho",
  SENT: "Enviado",
  RESPONDED: "Respondido",
  SELECTED: "Fornecedor selecionado",
  CONVERTED: "Convertido em cotação",
  CANCELLED: "Cancelado",
};

export const RECIPIENT_STATUSES = ["PENDING", "RESPONDED"] as const;
export type RecipientStatus = (typeof RECIPIENT_STATUSES)[number];