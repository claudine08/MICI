"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  CheckCircle2,
  FileText,
  BadgeDollarSign,
  TrendingDown,
  Building2,
} from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import {
  PURCHASE_REQUEST_STATUS_LABELS_PT,
  QUOTATION_STATUS_LABELS_PT,
  SUPPLIER_CATEGORY_LABELS_PT,
  SUPPLIER_STATUS_LABELS_PT,
  type ProcurementBoardSummary,
  type PurchaseRequestAction,
  type PurchaseRequestStatus,
  type QuotationAction,
  type QuotationStatus,
  type SupplierCategory,
  type SupplierStatus,
} from "@/modules/procurement/engine";
import { FIELD_PRIORITIES, FIELD_PRIORITY_LABELS_PT, type FieldPriority } from "@/modules/field/engine";

export interface PurchaseRequestItemRow {
  id?: string;
  itemNumber: number;
  description: string;
  quantity: number | string;
  unit: string;
  estimatedUnitPrice?: number | string | null;
  estimatedTotalPrice?: number | string | null;
}

export interface PurchaseRequestRow {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  priority: FieldPriority;
  status: PurchaseRequestStatus;
  requiredDate?: Date | string | null;
  costCenter?: string | null;
  wbsNodeId?: string | null;
  activityId?: string | null;
  costItemId?: string | null;
  items?: PurchaseRequestItemRow[];
  _count?: { items: number; quotations: number };
}

export interface QuotationRow {
  id: string;
  requestId: string;
  supplierId: string;
  code: string;
  status: QuotationStatus;
  leadTimeDays?: number | null;
  paymentTerms?: string | null;
  shippingTerms?: string | null;
  shippingCost?: number | string;
  discount?: number | string;
  totalAmount: number | string;
  supplier?: { id: string; name: string };
  request?: { id: string; code: string; title: string };
}

export interface SupplierRow {
  id: string;
  code: string;
  name: string;
  tradeName?: string | null;
  taxId?: string | null;
  category?: string | null;
  email?: string | null;
  phone?: string | null;
  status: SupplierStatus;
}

interface Props {
  projectId: string;
  initialSummary: ProcurementBoardSummary;
  initialRequests: PurchaseRequestRow[];
  initialQuotations: QuotationRow[];
  initialSuppliers: SupplierRow[];
  wbsNodes: { id: string; label: string }[];
  activities: { id: string; label: string }[];
  costItems: { id: string; label: string }[];
  canCreate: boolean;
  canEdit: boolean;
  canApprove: boolean;
  canDelete: boolean;
}

export function ProcurementView({
  projectId,
  initialSummary,
  initialRequests,
  initialQuotations,
  initialSuppliers,
  wbsNodes,
  activities,
  costItems,
  canCreate,
  canEdit,
  canApprove,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"requests" | "quotations" | "comparison" | "suppliers">("requests");
  const [comparisonSort, setComparisonSort] = useState<"price" | "leadTime" | "freight" | "discount">("price");
  const [summary, setSummary] = useState(initialSummary);
  const [requests, setRequests] = useState(initialRequests);
  const [quotations, setQuotations] = useState(initialQuotations);
  const [suppliers, setSuppliers] = useState(initialSuppliers);

  const summaryBase = `/api/v1/projects/${projectId}/procurement/summary`;
  const requestBase = `/api/v1/projects/${projectId}/procurement/requests`;
  const quotationBase = `/api/v1/projects/${projectId}/procurement/quotations`;
  const supplierBase = `/api/v1/suppliers`;

  const loadAll = async () => {
    try {
      const [s, r, q, sup] = await Promise.all([
        apiRequest<{ summary: ProcurementBoardSummary }>(summaryBase),
        apiRequest<{ requests: PurchaseRequestRow[] }>(requestBase),
        apiRequest<{ quotations: QuotationRow[] }>(quotationBase),
        apiRequest<{ suppliers: SupplierRow[] }>(supplierBase),
      ]);
      setSummary(s.summary);
      setRequests(r.requests);
      setQuotations(q.quotations);
      setSuppliers(sup.suppliers);
      setError(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao carregar os dados de suprimentos.");
    }
  };

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Dialogs
  const [isNewRequestOpen, setIsNewRequestOpen] = useState(false);
  const [isNewQuotationOpen, setIsNewQuotationOpen] = useState(false);
  const [isNewSupplierOpen, setIsNewSupplierOpen] = useState(false);
  const [selectedRequestForDetail, setSelectedRequestForDetail] = useState<PurchaseRequestRow | null>(null);
  const [selectedRequestForComparison, setSelectedRequestForComparison] = useState<string>(
    requests[0]?.id ?? ""
  );

  // Form states - Request
  const [reqTitle, setReqTitle] = useState("");
  const [reqDescription, setReqDescription] = useState("");
  const [reqPriority, setReqPriority] = useState<FieldPriority>("MEDIUM");
  const [reqRequiredDate, setReqRequiredDate] = useState("");
  const [reqCostCenter, setReqCostCenter] = useState("");
  const [reqWbsNodeId, setReqWbsNodeId] = useState("");
  const [reqActivityId, setReqActivityId] = useState("");
  const [reqCostItemId, setReqCostItemId] = useState("");
  const [reqItems, setReqItems] = useState<{ description: string; quantity: number; unit: string; estimatedUnitPrice?: number }[]>([
    { description: "", quantity: 1, unit: "un" },
  ]);

  // Form states - Quotation
  const [quoteRequestId, setQuoteRequestId] = useState("");
  const [quoteSupplierId, setQuoteSupplierId] = useState("");
  const [quoteLeadTimeDays, setQuoteLeadTimeDays] = useState<number>(5);
  const [quotePaymentTerms, setQuotePaymentTerms] = useState("28 DDL");
  const [quoteShippingTerms, setQuoteShippingTerms] = useState("CIF");
  const [quoteShippingCost, setQuoteShippingCost] = useState<number>(0);
  const [quoteDiscount, setQuoteDiscount] = useState<number>(0);
  const [quoteItems, setQuoteItems] = useState<{ description: string; quantity: number; unit: string; unitPrice: number; brand?: string }[]>([
    { description: "", quantity: 1, unit: "un", unitPrice: 0 },
  ]);

  // Form states - Supplier
  const [supName, setSupName] = useState("");
  const [supTradeName, setSupTradeName] = useState("");
  const [supTaxId, setSupTaxId] = useState("");
  const [supCategory, setSupCategory] = useState<SupplierCategory>("MATERIAIS");
  const [supEmail, setSupEmail] = useState("");
  const [supPhone, setSupPhone] = useState("");
  const [supContactName, setSupContactName] = useState("");
  const [supAddress, setSupAddress] = useState("");

  // Comparison conclusion
  const [comparisonSelectionReason, setComparisonSelectionReason] = useState("");
  const [selectedWinnerQuotationId, setSelectedWinnerQuotationId] = useState("");

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiRequest(`/api/v1/projects/${projectId}/procurement/requests`, {
        method: "POST",
        body: JSON.stringify({
          title: reqTitle,
          description: reqDescription || undefined,
          priority: reqPriority,
          requiredDate: reqRequiredDate || undefined,
          costCenter: reqCostCenter || undefined,
          wbsNodeId: reqWbsNodeId || undefined,
          activityId: reqActivityId || undefined,
          costItemId: reqCostItemId || undefined,
          items: reqItems.filter((it) => it.description.trim().length > 0),
          clientUuid: crypto.randomUUID(),
        }),
      });
      setIsNewRequestOpen(false);
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao criar requisição.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiRequest(`/api/v1/projects/${projectId}/procurement/quotations`, {
        method: "POST",
        body: JSON.stringify({
          requestId: quoteRequestId,
          supplierId: quoteSupplierId,
          leadTimeDays: Number(quoteLeadTimeDays),
          paymentTerms: quotePaymentTerms || undefined,
          shippingTerms: quoteShippingTerms || undefined,
          shippingCost: Number(quoteShippingCost),
          discount: Number(quoteDiscount),
          items: quoteItems.filter((it) => it.description.trim().length > 0),
          clientUuid: crypto.randomUUID(),
        }),
      });
      setIsNewQuotationOpen(false);
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao criar cotação.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiRequest("/api/v1/suppliers", {
        method: "POST",
        body: JSON.stringify({
          name: supName,
          tradeName: supTradeName || undefined,
          taxId: supTaxId || undefined,
          category: supCategory,
          email: supEmail || undefined,
          phone: supPhone || undefined,
          contactName: supContactName || undefined,
          address: supAddress || undefined,
          clientUuid: crypto.randomUUID(),
        }),
      });
      setIsNewSupplierOpen(false);
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao cadastrar fornecedor.");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestTransition = async (requestId: string, action: PurchaseRequestAction) => {
    setError(null);
    setLoading(true);
    try {
      await apiRequest(`/api/v1/projects/${projectId}/procurement/requests/${requestId}/status`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar status da requisição.");
    } finally {
      setLoading(false);
    }
  };

  const handleQuotationTransition = async (quotationId: string, action: QuotationAction) => {
    setError(null);
    setLoading(true);
    try {
      await apiRequest(`/api/v1/projects/${projectId}/procurement/quotations/${quotationId}/status`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar cotação.");
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteComparison = async (requestId: string) => {
    const quotes = quotations.filter((q) => q.requestId === requestId);
    const lowestId = [...quotes].sort((a, b) => Number(a.totalAmount) - Number(b.totalAmount))[0]?.id ?? "";
    const winnerId = selectedWinnerQuotationId || lowestId;
    if (!winnerId) {
      setError("Selecione a cotação vencedora.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await apiRequest(`/api/v1/projects/${projectId}/procurement/requests/${requestId}/comparison/complete`, {
        method: "POST",
        body: JSON.stringify({
          selectedQuotationId: winnerId,
          selectionReason: comparisonSelectionReason || "Menor preço global e atendimento ao prazo.",
        }),
      });
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao concluir mapa comparativo.");
    } finally {
      setLoading(false);
    }
  };

  const activeComparisonRequest = requests.find((r) => r.id === selectedRequestForComparison);
  const comparisonQuotes = quotations.filter((q) => q.requestId === selectedRequestForComparison);
  const comparisonLowestPriceId = [...comparisonQuotes].sort((a, b) => Number(a.totalAmount) - Number(b.totalAmount))[0]?.id ?? "";
  const effectiveWinnerId = selectedWinnerQuotationId || comparisonLowestPriceId;
  const sortedQuotes = [...comparisonQuotes].sort((a, b) => {
    if (comparisonSort === "leadTime") return (a.leadTimeDays ?? 9999) - (b.leadTimeDays ?? 9999);
    if (comparisonSort === "freight") return Number(a.shippingCost ?? 0) - Number(b.shippingCost ?? 0);
    if (comparisonSort === "discount") return Number(b.discount ?? 0) - Number(a.discount ?? 0);
    return Number(a.totalAmount) - Number(b.totalAmount);
  });
  const lowestTotal = [...comparisonQuotes].sort((a, b) => Number(a.totalAmount) - Number(b.totalAmount))[0]
    ? Number([...comparisonQuotes].sort((a, b) => Number(a.totalAmount) - Number(b.totalAmount))[0].totalAmount)
    : 0;
  const fastestQuoteId = [...comparisonQuotes]
    .filter((q) => (q.leadTimeDays ?? 0) > 0)
    .sort((a, b) => (a.leadTimeDays ?? 0) - (b.leadTimeDays ?? 0))[0]?.id;
  const lowestPriceId = [...comparisonQuotes].sort((a, b) => Number(a.totalAmount) - Number(b.totalAmount))[0]?.id;

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Board Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card className="p-3 text-center">
          <div className="text-xs text-muted-foreground">Requisições</div>
          <div className="text-xl font-bold">{summary.totalRequests}</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-xs text-muted-foreground">Abertas</div>
          <div className="text-xl font-bold text-blue-600">{summary.openRequests}</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-xs text-muted-foreground">Em cotação</div>
          <div className="text-xl font-bold text-amber-600">{summary.quotingRequests}</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-xs text-muted-foreground">Cotadas / Comp.</div>
          <div className="text-xl font-bold text-indigo-600">{summary.comparedRequests}</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-xs text-muted-foreground">Aprovadas</div>
          <div className="text-xl font-bold text-emerald-600">{summary.approvedRequests}</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-xs text-muted-foreground">Fornecedores Ativos</div>
          <div className="text-xl font-bold text-purple-600">{summary.activeSuppliers}</div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("requests")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "requests" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText className="h-4 w-4" />
          Requisições de Compra ({requests.length})
        </button>
        <button
          onClick={() => setActiveTab("quotations")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "quotations" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <BadgeDollarSign className="h-4 w-4" />
          Cotações ({quotations.length})
        </button>
        <button
          onClick={() => setActiveTab("comparison")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "comparison" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <TrendingDown className="h-4 w-4" />
          Mapa Comparativo
        </button>
        <button
          onClick={() => setActiveTab("suppliers")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "suppliers" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Building2 className="h-4 w-4" />
          Fornecedores ({suppliers.length})
        </button>
      </div>

      {/* TAB 1: REQUISIÇÕES */}
      {activeTab === "requests" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Requisições de Compra</h2>
            {canCreate && (
              <Button onClick={() => setIsNewRequestOpen(true)} size="sm">
                <Plus className="mr-1 h-4 w-4" /> Nova Requisição
              </Button>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Código</th>
                  <th className="px-4 py-2.5">Título</th>
                  <th className="px-4 py-2.5">Prioridade</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Necessidade</th>
                  <th className="px-4 py-2.5">Itens</th>
                  <th className="px-4 py-2.5">Cotações</th>
                  <th className="px-4 py-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {requests.map((req) => (
                  <tr key={req.id} className="hover:bg-muted/10">
                    <td className="px-4 py-2.5 font-mono text-xs font-medium">{req.code}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{req.title}</div>
                      {req.costCenter && (
                        <div className="text-xs text-muted-foreground">Centro: {req.costCenter}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline">{FIELD_PRIORITY_LABELS_PT[req.priority as FieldPriority] ?? req.priority}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={req.status === "APPROVED" ? "default" : "secondary"}>
                        {PURCHASE_REQUEST_STATUS_LABELS_PT[req.status as PurchaseRequestStatus] ?? req.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {req.requiredDate ? new Date(req.requiredDate).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs">{req._count?.items ?? req.items?.length ?? 0}</td>
                    <td className="px-4 py-2.5 text-xs font-medium">
                      {req._count?.quotations ?? 0} cotação(ões)
                    </td>
                    <td className="px-4 py-2.5 text-right space-x-1">
                      {req.status === "DRAFT" && canEdit && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRequestTransition(req.id, "SUBMIT")}
                          disabled={loading}
                        >
                          Enviar
                        </Button>
                      )}
                      {req.status === "SUBMITTED" && canEdit && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRequestTransition(req.id, "START_QUOTING")}
                          disabled={loading}
                        >
                          Iniciar Cotação
                        </Button>
                      )}
                      {req.status === "COMPARED" && canApprove && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleRequestTransition(req.id, "APPROVE")}
                          disabled={loading}
                        >
                          Aprovar
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedRequestForDetail(req)}
                      >
                        Ver itens
                      </Button>
                    </td>
                  </tr>
                ))}
                {requests.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                      Nenhuma requisição de compra cadastrada no projeto.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: COTAÇÕES */}
      {activeTab === "quotations" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Cotações dos Fornecedores</h2>
            {canCreate && (
              <Button onClick={() => setIsNewQuotationOpen(true)} size="sm">
                <Plus className="mr-1 h-4 w-4" /> Nova Cotação
              </Button>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Código</th>
                  <th className="px-4 py-2.5">Requisição</th>
                  <th className="px-4 py-2.5">Fornecedor</th>
                  <th className="px-4 py-2.5">Prazo (Dias)</th>
                  <th className="px-4 py-2.5">Pagamento</th>
                  <th className="px-4 py-2.5">Total Geral</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {quotations.map((q) => (
                  <tr key={q.id} className="hover:bg-muted/10">
                    <td className="px-4 py-2.5 font-mono text-xs font-medium">{q.code}</td>
                    <td className="px-4 py-2.5 text-xs">
                      {q.request ? `${q.request.code} - ${q.request.title}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 font-medium">{q.supplier?.name}</td>
                    <td className="px-4 py-2.5 text-xs">{q.leadTimeDays ? `${q.leadTimeDays} d` : "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{q.paymentTerms ?? "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold">
                      {Number(q.totalAmount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={q.status === "SELECTED" ? "default" : q.status === "REJECTED" ? "destructive" : "secondary"}>
                        {QUOTATION_STATUS_LABELS_PT[q.status as QuotationStatus] ?? q.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right space-x-1">
                      {q.status === "DRAFT" && canEdit && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleQuotationTransition(q.id, "SUBMIT")}
                          disabled={loading}
                        >
                          Submeter
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {quotations.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                      Nenhuma cotação registrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: MAPA COMPARATIVO */}
      {activeTab === "comparison" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Mapa Comparativo de Cotações</h2>
              <p className="text-xs text-muted-foreground">
                Equalização de propostas comerciais: menores preços, prazos de entrega e condições.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Selecione a Requisição:</Label>
              <select
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                value={selectedRequestForComparison}
                onChange={(e) => setSelectedRequestForComparison(e.target.value)}
              >
                {requests.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} - {r.title} ({r.status})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {activeComparisonRequest && comparisonQuotes.length > 0 ? (
            <div className="flex flex-col gap-4">
              <div className="overflow-x-auto rounded-lg border border-border bg-surface">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5">Fornecedor</th>
                      <th className="px-4 py-2.5">Código Cotação</th>
                      <th
                        className="cursor-pointer px-4 py-2.5 hover:text-foreground"
                        onClick={() => setComparisonSort("leadTime")}
                      >
                        Prazo Entrega {comparisonSort === "leadTime" ? "▲" : ""}
                      </th>
                      <th className="px-4 py-2.5">Condições Pagto</th>
                      <th
                        className="cursor-pointer px-4 py-2.5 hover:text-foreground"
                        onClick={() => setComparisonSort("freight")}
                      >
                        Frete {comparisonSort === "freight" ? "▲" : ""}
                      </th>
                      <th
                        className="cursor-pointer px-4 py-2.5 hover:text-foreground"
                        onClick={() => setComparisonSort("discount")}
                      >
                        Desconto {comparisonSort === "discount" ? "▼" : ""}
                      </th>
                      <th
                        className="cursor-pointer px-4 py-2.5 hover:text-foreground"
                        onClick={() => setComparisonSort("price")}
                      >
                        Total Geral {comparisonSort === "price" ? "▲" : ""}
                      </th>
                      <th className="px-4 py-2.5">Diferença p/ Menor</th>
                      <th className="px-4 py-2.5 text-center">Seleção</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sortedQuotes.map((q) => {
                      const amount = Number(q.totalAmount);
                      const diffPercent = lowestTotal > 0 ? ((amount - lowestTotal) / lowestTotal) * 100 : 0;
                      const isLowestPrice = q.id === lowestPriceId;
                      const isFastest = q.id === fastestQuoteId;

                      return (
                        <tr key={q.id} className={isLowestPrice ? "bg-emerald-50/30 dark:bg-emerald-950/20" : ""}>
                          <td className="px-4 py-2.5 font-medium">
                            {q.supplier?.name}
                            {isLowestPrice && (
                              <Badge variant="default" className="ml-2 bg-emerald-600 text-xs">
                                Menor Preço
                              </Badge>
                            )}
                            {isFastest && (
                              <Badge variant="outline" className="ml-2 border-blue-500 text-blue-600 text-xs">
                                Menor Prazo
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs">{q.code}</td>
                          <td className="px-4 py-2.5 text-xs">{q.leadTimeDays} dias</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{q.paymentTerms}</td>
                          <td className="px-4 py-2.5 text-xs">{q.shippingTerms} ({Number(q.shippingCost) > 0 ? `R$ ${q.shippingCost}` : "Grátis"})</td>
                          <td className="px-4 py-2.5 text-xs text-emerald-600">
                            {Number(q.discount) > 0 ? `R$ ${q.discount}` : "—"}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-sm font-bold">
                            {amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                          </td>
                          <td className="px-4 py-2.5 text-xs">
                            {isLowestPrice ? (
                              <span className="text-emerald-600 font-medium">0% (Referência)</span>
                            ) : (
                              <span className="text-amber-600 font-medium">+{diffPercent.toFixed(1)}%</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <input
                              type="radio"
                              name="winnerQuotation"
                              checked={effectiveWinnerId === q.id}
                              onChange={() => setSelectedWinnerQuotationId(q.id)}
                              disabled={activeComparisonRequest.status === "COMPARED" || activeComparisonRequest.status === "APPROVED"}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {canEdit && activeComparisonRequest.status !== "COMPARED" && activeComparisonRequest.status !== "APPROVED" && (
                <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
                  <Label className="text-sm font-medium">Justificativa da Seleção Comercial:</Label>
                  <Input
                    placeholder="Ex.: Menor preço global e menor prazo de entrega atendendo às especificações..."
                    value={comparisonSelectionReason}
                    onChange={(e) => setComparisonSelectionReason(e.target.value)}
                  />
                  <div className="mt-2 flex justify-end">
                    <Button
                      onClick={() => handleCompleteComparison(selectedRequestForComparison)}
                      disabled={loading || comparisonQuotes.length === 0}
                    >
                      <CheckCircle2 className="mr-1.5 h-4 w-4 text-emerald-500" />
                      Concluir Mapa Comparativo e Selecionar Vencedora
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-muted-foreground">
              {activeComparisonRequest
                ? "Nenhuma cotação registrada para esta requisição ainda. Cadastre cotações na aba 'Cotações'."
                : "Selecione uma requisição com cotações cadastradas."}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: FORNECEDORES */}
      {activeTab === "suppliers" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Fornecedores Homologados</h2>
              <p className="text-xs text-muted-foreground">
                Base central de fornecedores da organização (§49).
              </p>
            </div>
            {canCreate && (
              <Button onClick={() => setIsNewSupplierOpen(true)} size="sm">
                <Plus className="mr-1 h-4 w-4" /> Novo Fornecedor
              </Button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {suppliers.map((s) => (
              <Card key={s.id} className="p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{s.code}</span>
                    <Badge variant={s.status === "ACTIVE" ? "default" : "secondary"}>
                      {SUPPLIER_STATUS_LABELS_PT[s.status as SupplierStatus] ?? s.status}
                    </Badge>
                  </div>
                  <div className="mt-2 text-sm font-semibold">{s.name}</div>
                  {s.tradeName && <div className="text-xs text-muted-foreground">{s.tradeName}</div>}
                  {s.taxId && <div className="text-xs text-muted-foreground">CNPJ/CPF: {s.taxId}</div>}
                  <div className="mt-2 text-xs">
                    <span className="text-muted-foreground">Categoria: </span>
                    <span className="font-medium">
                      {SUPPLIER_CATEGORY_LABELS_PT[s.category as SupplierCategory] ?? s.category ?? "Geral"}
                    </span>
                  </div>
                </div>
                <div className="mt-4 border-t border-border pt-2 text-xs text-muted-foreground">
                  <div>{s.email || "Sem e-mail"}</div>
                  <div>{s.phone || "Sem telefone"}</div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* DIALOG: NOVA REQUISIÇÃO */}
      <Dialog open={isNewRequestOpen} title="Nova Requisição de Compra" onClose={() => setIsNewRequestOpen(false)}>
        <div className="flex flex-col gap-4 p-4">
          <h2 className="text-base font-semibold">Nova Requisição de Compra</h2>
          <form onSubmit={handleCreateRequest} className="flex flex-col gap-3">
            <div>
              <Label>Título *</Label>
              <Input
                required
                placeholder="Ex.: Aquisição de Concreto Usinado Fck 30 MPa"
                value={reqTitle}
                onChange={(e) => setReqTitle(e.target.value)}
              />
            </div>
            <div>
              <Label>Descrição / Especificação</Label>
              <Input
                placeholder="Detalhes adicionais de especificação técnica"
                value={reqDescription}
                onChange={(e) => setReqDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Prioridade</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  value={reqPriority}
                  onChange={(e) => setReqPriority(e.target.value as FieldPriority)}
                >
                  {FIELD_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {FIELD_PRIORITY_LABELS_PT[p]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Data de Necessidade</Label>
                <Input
                  type="date"
                  value={reqRequiredDate}
                  onChange={(e) => setReqRequiredDate(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Vínculo WBS</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  value={reqWbsNodeId}
                  onChange={(e) => setReqWbsNodeId(e.target.value)}
                >
                  <option value="">Sem vínculo</option>
                  {wbsNodes.map((w) => (
                    <option key={w.id} value={w.id}>{w.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Vínculo Atividade</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  value={reqActivityId}
                  onChange={(e) => setReqActivityId(e.target.value)}
                >
                  <option value="">Sem vínculo</option>
                  {activities.map((a) => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Centro de Custo</Label>
                <Input
                  placeholder="Ex.: CC-ESTRUTURA"
                  value={reqCostCenter}
                  onChange={(e) => setReqCostCenter(e.target.value)}
                />
              </div>
              <div>
                <Label>Item de Custo</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  value={reqCostItemId}
                  onChange={(e) => setReqCostItemId(e.target.value)}
                >
                  <option value="">Sem vínculo</option>
                  {costItems.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dynamic Items */}
            <div className="mt-2 border-t border-border pt-2">
              <Label className="text-xs font-semibold">Itens da Requisição:</Label>
              <div className="mt-2 grid grid-cols-6 gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span className="col-span-3">Descrição do material ou serviço</span>
                <span>Qtd</span>
                <span>Unidade</span>
                <span className="text-primary">Preço Est. (R$)</span>
              </div>
              {reqItems.map((item, idx) => (
                <div key={idx} className="mt-1 grid grid-cols-6 gap-2">
                  <Input
                    className="col-span-3"
                    placeholder="Descrição do material ou serviço"
                    value={item.description}
                    onChange={(e) => {
                      const next = [...reqItems];
                      next[idx].description = e.target.value;
                      setReqItems(next);
                    }}
                  />
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Qtd"
                    value={item.quantity}
                    onChange={(e) => {
                      const next = [...reqItems];
                      next[idx].quantity = Number(e.target.value);
                      setReqItems(next);
                    }}
                  />
                  <Input
                    placeholder="Un"
                    value={item.unit}
                    onChange={(e) => {
                      const next = [...reqItems];
                      next[idx].unit = e.target.value;
                      setReqItems(next);
                    }}
                  />
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0,00"
                    value={item.estimatedUnitPrice ?? ""}
                    className="border-primary/40 bg-primary/5 font-semibold text-primary focus-visible:ring-primary"
                    onChange={(e) => {
                      const next = [...reqItems];
                      next[idx].estimatedUnitPrice = e.target.value ? Number(e.target.value) : undefined;
                      setReqItems(next);
                    }}
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setReqItems([...reqItems, { description: "", quantity: 1, unit: "un" }])}
              >
                + Adicionar Item
              </Button>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setIsNewRequestOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                Salvar Requisição
              </Button>
            </div>
          </form>
        </div>
      </Dialog>

      {/* DIALOG: NOVA COTAÇÃO */}
      <Dialog open={isNewQuotationOpen} title="Registrar Nova Cotação" onClose={() => setIsNewQuotationOpen(false)}>
        <div className="flex flex-col gap-4 p-4">
          <h2 className="text-base font-semibold">Registrar Nova Cotação</h2>
          <form onSubmit={handleCreateQuotation} className="flex flex-col gap-3">
            <div>
              <Label>Requisição de Compra *</Label>
              <select
                required
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                value={quoteRequestId}
                onChange={(e) => setQuoteRequestId(e.target.value)}
              >
                <option value="">Selecione a requisição...</option>
                {requests
                  .filter((r) => r.status !== "APPROVED" && r.status !== "CANCELLED")
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code} - {r.title}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <Label>Fornecedor *</Label>
              <select
                required
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                value={quoteSupplierId}
                onChange={(e) => setQuoteSupplierId(e.target.value)}
              >
                <option value="">Selecione o fornecedor...</option>
                {suppliers
                  .filter((s) => s.status === "ACTIVE")
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} - {s.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Prazo Entrega (Dias)</Label>
                <Input
                  type="number"
                  value={quoteLeadTimeDays}
                  onChange={(e) => setQuoteLeadTimeDays(Number(e.target.value))}
                />
              </div>
              <div>
                <Label>Condições Pagto</Label>
                <Input
                  placeholder="Ex.: 30 DDL"
                  value={quotePaymentTerms}
                  onChange={(e) => setQuotePaymentTerms(e.target.value)}
                />
              </div>
              <div>
                <Label>Termo de Frete</Label>
                <Input
                  placeholder="CIF / FOB"
                  value={quoteShippingTerms}
                  onChange={(e) => setQuoteShippingTerms(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Custo de Frete (R$)</Label>
                <Input
                  type="number"
                  step="any"
                  value={quoteShippingCost}
                  onChange={(e) => setQuoteShippingCost(Number(e.target.value))}
                />
              </div>
              <div>
                <Label>Desconto Comercial (R$)</Label>
                <Input
                  type="number"
                  step="any"
                  value={quoteDiscount}
                  onChange={(e) => setQuoteDiscount(Number(e.target.value))}
                />
              </div>
            </div>

            {/* Quotation items */}
            <div className="mt-2 border-t border-border pt-2">
              <Label className="text-xs font-semibold">Itens Precificados:</Label>
              <div className="mt-2 grid grid-cols-6 gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span className="col-span-2">Descrição</span>
                <span>Qtd</span>
                <span>Unidade</span>
                <span className="col-span-2 text-primary">Preço Unit (R$)</span>
              </div>
              {quoteItems.map((item, idx) => (
                <div key={idx} className="mt-1 grid grid-cols-6 gap-2">
                  <Input
                    className="col-span-2"
                    placeholder="Descrição do item"
                    value={item.description}
                    onChange={(e) => {
                      const next = [...quoteItems];
                      next[idx].description = e.target.value;
                      setQuoteItems(next);
                    }}
                  />
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Qtd"
                    value={item.quantity}
                    onChange={(e) => {
                      const next = [...quoteItems];
                      next[idx].quantity = Number(e.target.value);
                      setQuoteItems(next);
                    }}
                  />
                  <Input
                    placeholder="Un"
                    value={item.unit}
                    onChange={(e) => {
                      const next = [...quoteItems];
                      next[idx].unit = e.target.value;
                      setQuoteItems(next);
                    }}
                  />
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0,00"
                    value={item.unitPrice}
                    className="col-span-2 border-primary/40 bg-primary/5 font-semibold text-primary focus-visible:ring-primary"
                    onChange={(e) => {
                      const next = [...quoteItems];
                      next[idx].unitPrice = Number(e.target.value);
                      setQuoteItems(next);
                    }}
                  />
                </div>
              ))}
              <div className="mt-2 flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Total da cotação (itens + frete − desconto):</span>
                <span className="font-mono font-semibold">
                  {quoteItems
                    .reduce((acc, it) => acc + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0)
                    .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  {" "}
                  <span className="text-xs text-muted-foreground">
                    (+ frete R$ {Number(quoteShippingCost).toFixed(2)} − desconto R$ {Number(quoteDiscount).toFixed(2)})
                  </span>
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setQuoteItems([...quoteItems, { description: "", quantity: 1, unit: "un", unitPrice: 0 }])}
              >
                + Adicionar Item
              </Button>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setIsNewQuotationOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                Salvar Cotação
              </Button>
            </div>
          </form>
        </div>
      </Dialog>

      {/* DIALOG: NOVO FORNECEDOR */}
      <Dialog open={isNewSupplierOpen} title="Cadastrar Fornecedor" onClose={() => setIsNewSupplierOpen(false)}>
        <div className="flex flex-col gap-4 p-4">
          <h2 className="text-base font-semibold">Cadastrar Fornecedor</h2>
          <form onSubmit={handleCreateSupplier} className="flex flex-col gap-3">
            <div>
              <Label>Razão Social / Nome *</Label>
              <Input
                required
                placeholder="Ex.: Indústria Brasileira de Tubos S/A"
                value={supName}
                onChange={(e) => setSupName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Nome Fantasia</Label>
                <Input
                  placeholder="Ex.: IBT Tubos"
                  value={supTradeName}
                  onChange={(e) => setSupTradeName(e.target.value)}
                />
              </div>
              <div>
                <Label>CNPJ / CPF</Label>
                <Input
                  placeholder="00.000.000/0001-00"
                  value={supTaxId}
                  onChange={(e) => setSupTaxId(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Categoria</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  value={supCategory}
                  onChange={(e) => setSupCategory(e.target.value as SupplierCategory)}
                >
                  <option value="MATERIAIS">Materiais</option>
                  <option value="SERVICOS">Serviços</option>
                  <option value="EQUIPAMENTOS">Equipamentos</option>
                  <option value="EMPREITEIRO">Empreiteiro</option>
                  <option value="PROJETOS">Projetos</option>
                  <option value="OUTROS">Outros</option>
                </select>
              </div>
              <div>
                <Label>Contato Comercial</Label>
                <Input
                  placeholder="Ex.: João Silva"
                  value={supContactName}
                  onChange={(e) => setSupContactName(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>E-mail</Label>
                <Input
                  type="email"
                  placeholder="contato@fornecedor.com.br"
                  value={supEmail}
                  onChange={(e) => setSupEmail(e.target.value)}
                />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input
                  placeholder="(11) 98765-4321"
                  value={supPhone}
                  onChange={(e) => setSupPhone(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label>Endereço</Label>
              <Input
                placeholder="Ex.: Rodovia BR-101, Km 45 - São Paulo/SP"
                value={supAddress}
                onChange={(e) => setSupAddress(e.target.value)}
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setIsNewSupplierOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                Cadastrar
              </Button>
            </div>
          </form>
        </div>
      </Dialog>

      {/* DIALOG: ITENS DA REQUISIÇÃO */}
      <Dialog open={Boolean(selectedRequestForDetail)} title={selectedRequestForDetail ? `Itens da Requisição ${selectedRequestForDetail.code}` : "Itens da Requisição"} onClose={() => setSelectedRequestForDetail(null)}>
        {selectedRequestForDetail && (
          <div className="flex flex-col gap-4 p-4">
            <div>
              <h2 className="text-base font-semibold">
                Itens da Requisição {selectedRequestForDetail.code}
              </h2>
              <p className="text-xs text-muted-foreground">{selectedRequestForDetail.title}</p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/30 text-xs font-semibold text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">Descrição</th>
                    <th className="px-3 py-2">Quantidade</th>
                    <th className="px-3 py-2">Unidade</th>
                    <th className="px-3 py-2">Preço Est. Unit</th>
                    <th className="px-3 py-2">Total Estimado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {selectedRequestForDetail.items?.map((it) => (
                    <tr key={it.id ?? it.itemNumber}>
                      <td className="px-3 py-2 font-mono text-xs">{it.itemNumber}</td>
                      <td className="px-3 py-2 font-medium">{it.description}</td>
                      <td className="px-3 py-2">{Number(it.quantity)}</td>
                      <td className="px-3 py-2 text-xs">{it.unit}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {it.estimatedUnitPrice ? `R$ ${Number(it.estimatedUnitPrice).toFixed(2)}` : "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs font-semibold">
                        {it.estimatedTotalPrice ? `R$ ${Number(it.estimatedTotalPrice).toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setSelectedRequestForDetail(null)}>
                Fechar
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
