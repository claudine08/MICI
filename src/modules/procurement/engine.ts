// Motor de suprimentos (E14, §49, E14-US01..US03): Fornecedores, Requisição
// de Compra, Cotações e Mapa Comparativo de Preços — constantes, rótulos e
// máquinas de estados puras. Sem I/O.

// ---------------------------------------------------------------------------
// Fornecedores (Supplier)
// ---------------------------------------------------------------------------

export const SUPPLIER_STATUSES = ["ACTIVE", "BLOCKED", "INACTIVE"] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

export const SUPPLIER_STATUS_LABELS_PT: Record<SupplierStatus, string> = {
  ACTIVE: "Ativo",
  BLOCKED: "Bloqueado",
  INACTIVE: "Inativo",
};

export const SUPPLIER_CATEGORIES = [
  "MATERIAIS",
  "SERVICOS",
  "EQUIPAMENTOS",
  "EMPREITEIRO",
  "PROJETOS",
  "OUTROS",
] as const;
export type SupplierCategory = (typeof SUPPLIER_CATEGORIES)[number];

export const SUPPLIER_CATEGORY_LABELS_PT: Record<SupplierCategory, string> = {
  MATERIAIS: "Materiais",
  SERVICOS: "Serviços",
  EQUIPAMENTOS: "Equipamentos",
  EMPREITEIRO: "Empreiteiro",
  PROJETOS: "Projetos / Consultoria",
  OUTROS: "Outros",
};

export function isSupplierActive(status: SupplierStatus): boolean {
  return status === "ACTIVE";
}

// ---------------------------------------------------------------------------
// Requisição de Compra (PurchaseRequest)
// ---------------------------------------------------------------------------

export const PURCHASE_REQUEST_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "QUOTING",
  "COMPARED",
  "APPROVED",
  "CANCELLED",
  "REJECTED",
] as const;
export type PurchaseRequestStatus = (typeof PURCHASE_REQUEST_STATUSES)[number];

export const PURCHASE_REQUEST_STATUS_LABELS_PT: Record<PurchaseRequestStatus, string> = {
  DRAFT: "Rascunho",
  SUBMITTED: "Aberta",
  QUOTING: "Em cotação",
  COMPARED: "Cotada",
  APPROVED: "Aprovada",
  CANCELLED: "Cancelada",
  REJECTED: "Rejeitada",
};

export const PURCHASE_REQUEST_ACTIONS = [
  "SUBMIT",
  "START_QUOTING",
  "FINISH_QUOTING",
  "APPROVE",
  "REJECT",
  "CANCEL",
  "REOPEN",
] as const;
export type PurchaseRequestAction = (typeof PURCHASE_REQUEST_ACTIONS)[number];

export const PURCHASE_REQUEST_ACTION_LABELS_PT: Record<PurchaseRequestAction, string> = {
  SUBMIT: "Enviar para cotação",
  START_QUOTING: "Iniciar cotação",
  FINISH_QUOTING: "Finalizar cotação",
  APPROVE: "Aprovar requisição",
  REJECT: "Rejeitar",
  CANCEL: "Cancelar",
  REOPEN: "Reabrir",
};

export function isPurchaseRequestEditable(status: PurchaseRequestStatus): boolean {
  return status === "DRAFT" || status === "SUBMITTED";
}

export function isPurchaseRequestOpen(status: PurchaseRequestStatus): boolean {
  return status !== "APPROVED" && status !== "CANCELLED" && status !== "REJECTED";
}

export function isPurchaseRequestOverdue(
  requiredDate: Date | string | null | undefined,
  status: PurchaseRequestStatus,
  referenceDate: Date = new Date()
): boolean {
  if (!requiredDate || !isPurchaseRequestOpen(status)) return false;
  const d = typeof requiredDate === "string" ? new Date(requiredDate) : requiredDate;
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const due = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return due.getTime() < today.getTime();
}

export interface PurchaseRequestTransitionInput {
  currentStatus: PurchaseRequestStatus;
  action: PurchaseRequestAction;
  itemCount?: number;
  quotationCount?: number;
  hasSelectedQuotation?: boolean;
}

export function nextPurchaseRequestStatus(
  input: PurchaseRequestTransitionInput
): { nextStatus: PurchaseRequestStatus } | { error: string } {
  const { currentStatus, action, itemCount = 1, quotationCount = 0, hasSelectedQuotation = false } = input;

  switch (action) {
    case "SUBMIT":
      if (currentStatus !== "DRAFT") {
        return { error: `Não é possível enviar requisição com status '${PURCHASE_REQUEST_STATUS_LABELS_PT[currentStatus]}'.` };
      }
      if (itemCount <= 0) {
        return { error: "A requisição deve conter pelo menos 1 item para ser enviada." };
      }
      return { nextStatus: "SUBMITTED" };

    case "START_QUOTING":
      if (currentStatus !== "SUBMITTED") {
        return { error: `Iniciar cotação exige status 'Aberta', atual é '${PURCHASE_REQUEST_STATUS_LABELS_PT[currentStatus]}'.` };
      }
      return { nextStatus: "QUOTING" };

    case "FINISH_QUOTING":
      if (currentStatus !== "QUOTING") {
        return { error: `Finalizar cotação exige status 'Em cotação', atual é '${PURCHASE_REQUEST_STATUS_LABELS_PT[currentStatus]}'.` };
      }
      if (quotationCount <= 0) {
        return { error: "É necessário registrar ao menos 1 cotação antes de finalizar a fase de cotação." };
      }
      return { nextStatus: "COMPARED" };

    case "APPROVE":
      if (currentStatus !== "COMPARED" && currentStatus !== "SUBMITTED") {
        return { error: `Aprovação exige que a requisição esteja cotada ou enviada.` };
      }
      if (currentStatus === "COMPARED" && !hasSelectedQuotation) {
        return { error: "Aprovação de requisição cotada exige ao menos 1 cotação selecionada no mapa comparativo." };
      }
      return { nextStatus: "APPROVED" };

    case "REJECT":
      if (currentStatus !== "SUBMITTED" && currentStatus !== "COMPARED") {
        return { error: `Rejeição só é permitida em requisições abertas ou cotadas.` };
      }
      return { nextStatus: "REJECTED" };

    case "CANCEL":
      if (currentStatus === "APPROVED") {
        return { error: "Requisição já aprovada não pode ser cancelada diretamente." };
      }
      if (currentStatus === "CANCELLED") {
        return { error: "Requisição já está cancelada." };
      }
      return { nextStatus: "CANCELLED" };

    case "REOPEN":
      if (currentStatus !== "CANCELLED" && currentStatus !== "REJECTED") {
        return { error: "Apenas requisições canceladas ou rejeitadas podem ser reabertas." };
      }
      return { nextStatus: "DRAFT" };

    default:
      return { error: `Ação desconhecida: ${action}` };
  }
}

// ---------------------------------------------------------------------------
// Cotação (Quotation)
// ---------------------------------------------------------------------------

export const QUOTATION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "SELECTED",
  "REJECTED",
  "CANCELLED",
] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const QUOTATION_STATUS_LABELS_PT: Record<QuotationStatus, string> = {
  DRAFT: "Rascunho",
  SUBMITTED: "Enviada",
  SELECTED: "Selecionada",
  REJECTED: "Desqualificada",
  CANCELLED: "Cancelada",
};

export const QUOTATION_ACTIONS = ["SUBMIT", "SELECT", "REJECT", "CANCEL", "REOPEN"] as const;
export type QuotationAction = (typeof QUOTATION_ACTIONS)[number];

export const QUOTATION_ACTION_LABELS_PT: Record<QuotationAction, string> = {
  SUBMIT: "Finalizar cotação",
  SELECT: "Selecionar como vencedora",
  REJECT: "Desqualificar",
  CANCEL: "Cancelar",
  REOPEN: "Reabrir para edição",
};

export function isQuotationEditable(status: QuotationStatus): boolean {
  return status === "DRAFT";
}

export function nextQuotationStatus(
  currentStatus: QuotationStatus,
  action: QuotationAction,
  itemCount: number = 1
): { nextStatus: QuotationStatus } | { error: string } {
  switch (action) {
    case "SUBMIT":
      if (currentStatus !== "DRAFT") {
        return { error: `Apenas rascunho de cotação pode ser submetido.` };
      }
      if (itemCount <= 0) {
        return { error: "A cotação precisa de ao menos 1 item precificado." };
      }
      return { nextStatus: "SUBMITTED" };

    case "SELECT":
      if (currentStatus !== "SUBMITTED") {
        return { error: "Apenas cotações enviadas podem ser selecionadas." };
      }
      return { nextStatus: "SELECTED" };

    case "REJECT":
      if (currentStatus !== "SUBMITTED") {
        return { error: "Apenas cotações enviadas podem ser desqualificadas." };
      }
      return { nextStatus: "REJECTED" };

    case "CANCEL":
      if (currentStatus === "CANCELLED") {
        return { error: "Cotação já está cancelada." };
      }
      return { nextStatus: "CANCELLED" };

    case "REOPEN":
      if (currentStatus !== "CANCELLED" && currentStatus !== "REJECTED" && currentStatus !== "SUBMITTED") {
        return { error: "Esta cotação não pode ser reaberta." };
      }
      return { nextStatus: "DRAFT" };

    default:
      return { error: `Ação desconhecida: ${action}` };
  }
}

export interface QuotationCalculationItem {
  quantity: number;
  unitPrice: number;
}

export function calculateQuotationTotals(
  items: QuotationCalculationItem[],
  shippingCost: number = 0,
  discount: number = 0
): { itemsTotal: number; totalAmount: number } {
  const itemsTotal = items.reduce((acc, it) => acc + (it.quantity * it.unitPrice), 0);
  const totalAmount = Math.max(0, itemsTotal + shippingCost - discount);
  return {
    itemsTotal: Math.round(itemsTotal * 100) / 100,
    totalAmount: Math.round(totalAmount * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Mapa Comparativo de Cotações (BidComparison)
// ---------------------------------------------------------------------------

export const BID_COMPARISON_STATUSES = ["DRAFT", "COMPLETED", "CANCELLED"] as const;
export type BidComparisonStatus = (typeof BID_COMPARISON_STATUSES)[number];

export const BID_COMPARISON_STATUS_LABELS_PT: Record<BidComparisonStatus, string> = {
  DRAFT: "Em elaboração",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
};

export interface QuotationComparisonEntry {
  quotationId: string;
  quotationCode: string;
  supplierId: string;
  supplierName: string;
  totalAmount: number;
  leadTimeDays?: number | null;
  paymentTerms?: string | null;
  status: QuotationStatus;
}

export interface BidComparisonAnalysis {
  quotationCount: number;
  lowestPriceQuotationId?: string;
  lowestPrice?: number;
  fastestLeadTimeQuotationId?: string;
  fastestLeadTimeDays?: number;
  entries: (QuotationComparisonEntry & {
    priceRank: number;
    differenceFromLowestPercent: number;
    isLowestPrice: boolean;
    isFastest: boolean;
  })[];
}

export function analyzeBidComparison(quotations: QuotationComparisonEntry[]): BidComparisonAnalysis {
  if (quotations.length === 0) {
    return {
      quotationCount: 0,
      entries: [],
    };
  }

  const sortedByPrice = [...quotations].sort((a, b) => a.totalAmount - b.totalAmount);
  const lowestPrice = sortedByPrice[0].totalAmount;
  const lowestPriceQuotationId = sortedByPrice[0].quotationId;

  const validLeadTimes = quotations.filter((q) => typeof q.leadTimeDays === "number" && q.leadTimeDays > 0);
  const sortedByLeadTime = [...validLeadTimes].sort((a, b) => (a.leadTimeDays ?? 0) - (b.leadTimeDays ?? 0));
  const fastestLeadTimeQuotationId = sortedByLeadTime[0]?.quotationId;
  const fastestLeadTimeDays = sortedByLeadTime[0]?.leadTimeDays ?? undefined;

  const entries = sortedByPrice.map((entry, index) => {
    const diff = lowestPrice > 0 ? ((entry.totalAmount - lowestPrice) / lowestPrice) * 100 : 0;
    return {
      ...entry,
      priceRank: index + 1,
      differenceFromLowestPercent: Math.round(diff * 10) / 10,
      isLowestPrice: entry.quotationId === lowestPriceQuotationId,
      isFastest: entry.quotationId === fastestLeadTimeQuotationId,
    };
  });

  return {
    quotationCount: quotations.length,
    lowestPriceQuotationId,
    lowestPrice,
    fastestLeadTimeQuotationId,
    fastestLeadTimeDays,
    entries,
  };
}

// ---------------------------------------------------------------------------
// Resumo do Quadro de Suprimentos (Board Summary)
// ---------------------------------------------------------------------------

export interface ProcurementBoardSummary {
  totalRequests: number;
  openRequests: number;
  quotingRequests: number;
  comparedRequests: number;
  approvedRequests: number;
  overdueRequests: number;
  totalQuotations: number;
  selectedQuotations: number;
  totalSuppliers: number;
  activeSuppliers: number;
}

export function summarizeProcurementBoard(
  requests: { status: PurchaseRequestStatus; requiredDate?: Date | string | null }[],
  quotations: { status: QuotationStatus }[],
  suppliers: { status: SupplierStatus }[]
): ProcurementBoardSummary {
  return {
    totalRequests: requests.length,
    openRequests: requests.filter((r) => r.status === "SUBMITTED" || r.status === "DRAFT").length,
    quotingRequests: requests.filter((r) => r.status === "QUOTING").length,
    comparedRequests: requests.filter((r) => r.status === "COMPARED").length,
    approvedRequests: requests.filter((r) => r.status === "APPROVED").length,
    overdueRequests: requests.filter((r) => isPurchaseRequestOverdue(r.requiredDate, r.status)).length,
    totalQuotations: quotations.length,
    selectedQuotations: quotations.filter((q) => q.status === "SELECTED").length,
    totalSuppliers: suppliers.length,
    activeSuppliers: suppliers.filter((s) => s.status === "ACTIVE").length,
  };
}

