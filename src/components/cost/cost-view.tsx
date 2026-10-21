"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Upload, CheckCircle2, FileJson } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";

// Visão de custo do projeto (E08 §29): itens de orçamento, compromissos,
// realizados, baseline de custo e EVM. Os dados iniciais vêm do server
// component; após cada mutação o router.refresh() recarrega a página.

interface WbsNodeLite {
  id: string;
  code: string;
  name: string;
}

export interface CostItemRow {
  id: string;
  code: string;
  description: string;
  category: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  origin: string | null;
  wbsNodeId: string | null;
  wbsNodeCode: string | null;
  wbsNodeName: string | null;
  commitmentTotal: number;
  actualTotal: number;
  version: number;
}

export interface CommitmentRow {
  id: string;
  code: string;
  description: string;
  supplier: string | null;
  amount: number;
  committedAt: string;
  status: "OPEN" | "CLOSED" | "CANCELLED";
  costItemCode: string | null;
  version: number;
}

export interface ActualRow {
  id: string;
  code: string;
  description: string;
  amount: number;
  incurredAt: string;
  costItemCode: string | null;
  commitmentCode: string | null;
  version: number;
}

export interface CostBaselineRow {
  id: string;
  version: number;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "SUPERSEDED";
  reason: string | null;
  totalBudget: number;
  itemCount: number;
  changeCode: string | null;
  createdAt: string;
}

export interface EvmResult {
  bac: number;
  pv: number;
  ev: number;
  ac: number;
  cv: number | null;
  sv: number | null;
  cpi: number | null;
  spi: number | null;
  eac: number | null;
  vac: number | null;
  percentPlanned: number;
  percentEarned: number;
  percentSpent: number;
  dataDate: string;
}

interface CostPayload {
  items: CostItemRow[];
  commitments: CommitmentRow[];
  actuals: ActualRow[];
  baselines: CostBaselineRow[];
  evm: EvmResult;
}

interface Props {
  projectId: string;
  wbsNodes: WbsNodeLite[];
  initialData: CostPayload;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
}

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Preview do que foi extraído do JSON (arquivo colado) antes de confirmar a
// importação. Só depende de `quantitativos`, o mesmo que a API espera.
interface ImportPreview {
  lineCount: number;
  totalDirect: number;
  groups: Array<{ grupo: number; grupoNome: string; total: number }>;
  firstLines: Array<{ descricao: string; quantidade: number; pu: number; custoTotal: number }>;
}

// Extrai o array `quantitativos` de um JSON colado. Aceita tanto o objeto
// completo exportado por /orcamento (BudgetEstimate) quanto um objeto já
// reduzido no formato da API. Lança Error com mensagem em pt-BR se inválido.
function extractQuantitativos(raw: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("JSON inválido — verifique se o conteúdo colado é um JSON válido.");
  }
  const quantitativos =
    parsed && typeof parsed === "object" && Array.isArray((parsed as { quantitativos?: unknown[] }).quantitativos)
      ? (parsed as { quantitativos: unknown[] }).quantitativos
      : Array.isArray(parsed)
        ? parsed
        : null;
  if (!quantitativos || quantitativos.length === 0) {
    throw new Error("Campo `quantitativos` ausente ou vazio no JSON.");
  }
  return quantitativos;
}

// Monta o preview agregando por grupo e somando o custo direto, sem confiar em
// `consolidacao` (que pode não existir).
function buildImportPreview(quantitativos: unknown[]): ImportPreview {
  const lines = quantitativos as Array<{
    grupo?: number;
    grupoNome?: string;
    descricao?: string;
    quantidade?: number;
    pu?: number;
    custoTotal?: number;
  }>;
  const byGroup = new Map<number, { grupoNome: string; total: number }>();
  let totalDirect = 0;
  for (const line of lines) {
    const custo = Number(line.custoTotal ?? 0) || 0;
    totalDirect += custo;
    const grupo = Number(line.grupo ?? 0) || 0;
    const entry = byGroup.get(grupo) ?? { grupoNome: line.grupoNome ?? `Grupo ${grupo}`, total: 0 };
    entry.total += custo;
    byGroup.set(grupo, entry);
  }
  return {
    lineCount: lines.length,
    totalDirect: Math.round(totalDirect * 100) / 100,
    groups: [...byGroup.entries()]
      .map(([grupo, value]) => ({ grupo, grupoNome: value.grupoNome, total: Math.round(value.total * 100) / 100 }))
      .sort((a, b) => a.grupo - b.grupo),
    firstLines: lines.slice(0, 6).map((line) => ({
      descricao: String(line.descricao ?? "—"),
      quantidade: Number(line.quantidade ?? 0) || 0,
      pu: Number(line.pu ?? 0) || 0,
      custoTotal: Number(line.custoTotal ?? 0) || 0,
    })),
  };
}

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

interface ItemForm {
  code: string;
  description: string;
  category: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  wbsNodeId: string;
}

const emptyItemForm: ItemForm = {
  code: "",
  description: "",
  category: "",
  unit: "",
  quantity: "1",
  unitPrice: "0",
  wbsNodeId: "",
};

interface CommitmentForm {
  code: string;
  description: string;
  supplier: string;
  amount: string;
  committedAt: string;
  costItemId: string;
}

const emptyCommitmentForm: CommitmentForm = {
  code: "",
  description: "",
  supplier: "",
  amount: "0",
  committedAt: new Date().toISOString().slice(0, 10),
  costItemId: "",
};

interface ActualForm {
  code: string;
  description: string;
  amount: string;
  incurredAt: string;
  costItemId: string;
}

const emptyActualForm: ActualForm = {
  code: "",
  description: "",
  amount: "0",
  incurredAt: new Date().toISOString().slice(0, 10),
  costItemId: "",
};

const BASELINE_BADGE: Record<CostBaselineRow["status"], string> = {
  DRAFT: "Rascunho",
  SUBMITTED: "Em análise",
  APPROVED: "Aprovada",
  SUPERSEDED: "Substituída",
};

export function CostView({
  projectId,
  wbsNodes,
  initialData,
  canCreate,
  canEdit,
  canDelete,
  canApprove,
}: Props) {
  const router = useRouter();
  const base = `/api/v1/projects/${projectId}/cost`;
  const [data, setData] = useState<CostPayload>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [itemDialog, setItemDialog] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItemForm);

  const [commitmentDialog, setCommitmentDialog] = useState(false);
  const [editingCommitmentId, setEditingCommitmentId] = useState<string | null>(null);
  const [commitmentForm, setCommitmentForm] = useState<CommitmentForm>(emptyCommitmentForm);

  const [actualDialog, setActualDialog] = useState(false);
  const [actualForm, setActualForm] = useState<ActualForm>(emptyActualForm);

  const [importDialog, setImportDialog] = useState(false);
  const [importText, setImportText] = useState("");
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Após cada mutação, busca o payload consolidado do servidor (itens,
  // compromissos, realizados, baselines e EVM recalculado) e sincroniza o
  // estado local — o EVM deriva do estado persistido, então o refetch é a
  // única forma de mantê-lo honesto. router.refresh() mantém o server
  // component alinhado com o novo estado.
  const load = async () => {
    try {
      const payload = await apiRequest<CostPayload>(`${base}/summary`);
      setData(payload);
      setError(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao carregar custos.");
    }
  };

  const setItem = (key: keyof ItemForm, value: string) =>
    setItemForm((previous) => ({ ...previous, [key]: value }));
  const setCommitment = (key: keyof CommitmentForm, value: string) =>
    setCommitmentForm((previous) => ({ ...previous, [key]: value }));
  const setActual = (key: keyof ActualForm, value: string) =>
    setActualForm((previous) => ({ ...previous, [key]: value }));

  const openCreateItem = () => {
    setEditingItemId(null);
    setItemForm(emptyItemForm);
    setError(null);
    setItemDialog(true);
  };

  const openEditItem = (item: CostItemRow) => {
    setEditingItemId(item.id);
    setItemForm({
      code: item.code,
      description: item.description,
      category: item.category,
      unit: item.unit,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
      wbsNodeId: item.wbsNodeId ?? "",
    });
    setError(null);
    setItemDialog(true);
  };

  const submitItem = async () => {
    setError(null);
    setBusy(true);
    try {
      const payload = {
        code: itemForm.code || undefined,
        description: itemForm.description,
        category: itemForm.category,
        unit: itemForm.unit,
        quantity: Number(itemForm.quantity),
        unitPrice: Number(itemForm.unitPrice),
        wbsNodeId: itemForm.wbsNodeId || null,
      };
      if (editingItemId) {
        await apiRequest(`${base}/${editingItemId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest(base, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setItemDialog(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar item.");
    } finally {
      setBusy(false);
    }
  };

  const removeItem = async (item: CostItemRow) => {
    if (!window.confirm(`Remover o item ${item.code}?`)) return;
    setError(null);
    try {
      await apiRequest(`${base}/${item.id}`, { method: "DELETE" });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao remover item.");
    }
  };

  const openCreateCommitment = () => {
    setEditingCommitmentId(null);
    setCommitmentForm(emptyCommitmentForm);
    setError(null);
    setCommitmentDialog(true);
  };

  const openEditCommitment = (commitment: CommitmentRow) => {
    setEditingCommitmentId(commitment.id);
    setCommitmentForm({
      code: commitment.code,
      description: commitment.description,
      supplier: commitment.supplier ?? "",
      amount: String(commitment.amount),
      committedAt: commitment.committedAt,
      costItemId: "",
    });
    setError(null);
    setCommitmentDialog(true);
  };

  const submitCommitment = async () => {
    setError(null);
    setBusy(true);
    try {
      const payload = {
        code: commitmentForm.code || undefined,
        description: commitmentForm.description,
        supplier: commitmentForm.supplier || undefined,
        amount: Number(commitmentForm.amount),
        committedAt: commitmentForm.committedAt,
        costItemId: commitmentForm.costItemId || null,
      };
      if (editingCommitmentId) {
        await apiRequest(`${base}/commitments/${editingCommitmentId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest(`${base}/commitments`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setCommitmentDialog(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar compromisso.");
    } finally {
      setBusy(false);
    }
  };

  const removeCommitment = async (commitment: CommitmentRow) => {
    if (!window.confirm(`Remover o compromisso ${commitment.code}?`)) return;
    setError(null);
    try {
      await apiRequest(`${base}/commitments/${commitment.id}`, { method: "DELETE" });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao remover compromisso.");
    }
  };

  const openCreateActual = () => {
    setActualForm(emptyActualForm);
    setError(null);
    setActualDialog(true);
  };

  const submitActual = async () => {
    setError(null);
    setBusy(true);
    try {
      await apiRequest(`${base}/actuals`, {
        method: "POST",
        body: JSON.stringify({
          code: actualForm.code || undefined,
          description: actualForm.description,
          amount: Number(actualForm.amount),
          incurredAt: actualForm.incurredAt,
          costItemId: actualForm.costItemId || null,
        }),
      });
      setActualDialog(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao registrar realizado.");
    } finally {
      setBusy(false);
    }
  };

  const removeActual = async (actual: ActualRow) => {
    if (!window.confirm(`Remover o realizado ${actual.code}?`)) return;
    setError(null);
    try {
      await apiRequest(`${base}/actuals/${actual.id}`, { method: "DELETE" });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao remover realizado.");
    }
  };

  const createBaseline = async () => {
    setError(null);
    setBusy(true);
    try {
      await apiRequest(`${base}/baselines`, {
        method: "POST",
        body: JSON.stringify({ reason: "Baseline de custo" }),
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao criar baseline.");
    } finally {
      setBusy(false);
    }
  };

  const transitionBaseline = async (id: string, action: "SUBMIT" | "APPROVE" | "REJECT") => {
    setError(null);
    try {
      await apiRequest(`${base}/baselines/${id}`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha na transição da baseline.");
    }
  };

  const resetImport = () => {
    setImportText("");
    setImportFileName(null);
    setImportPreview(null);
    setImportError(null);
    setDragOver(false);
  };

  // Lê o conteúdo colado e monta o preview. Não envia nada ainda — só extrai.
  const parseImport = (raw: string) => {
    setImportText(raw);
    if (!raw.trim()) {
      setImportPreview(null);
      setImportError(null);
      return;
    }
    try {
      const quantitativos = extractQuantitativos(raw);
      setImportPreview(buildImportPreview(quantitativos));
      setImportError(null);
    } catch (caught) {
      setImportPreview(null);
      setImportError(caught instanceof Error ? caught.message : "Falha ao ler o JSON.");
    }
  };

  // Upload de arquivo .json — extrai o texto e roda o mesmo parse.
  const onImportFile = async (file: File | null | undefined) => {
    if (!file) return;
    setImportFileName(file.name);
    const text = await file.text();
    parseImport(text);
  };

  const importEstimate = async () => {
    if (!importPreview) return;
    setError(null);
    setBusy(true);
    try {
      await apiRequest(`${base}/import-estimate`, {
        method: "POST",
        body: importText,
      });
      setImportDialog(false);
      resetImport();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao importar estimate.");
    } finally {
      setBusy(false);
    }
  };

  const evm = data.evm;

  return (
    <div className="flex flex-col gap-6">
      <ErrorBox message={error} />

      {evm && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">EVM — desempenho de custo</h2>
            <span className="text-xs text-muted-foreground">
              Data de corte: {evm.dataDate}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {[
              { label: "BAC", value: brl(evm.bac) },
              { label: "PV", value: brl(evm.pv) },
              { label: "EV", value: brl(evm.ev) },
              { label: "AC", value: brl(evm.ac) },
              { label: "EAC", value: brl(evm.eac ?? 0) },
              { label: "VAC", value: brl(evm.vac ?? 0) },
              { label: "CPI", value: evm.cpi === null ? "—" : evm.cpi.toFixed(2) },
              { label: "SPI", value: evm.spi === null ? "—" : evm.spi.toFixed(2) },
              { label: "CV", value: evm.cv === null ? "—" : brl(evm.cv) },
              { label: "SV", value: evm.sv === null ? "—" : brl(evm.sv) },
              { label: "Planejado", value: `${evm.percentPlanned.toFixed(0)}%` },
              { label: "Realizado", value: `${evm.percentEarned.toFixed(0)}%` },
            ].map((cell) => (
              <div key={cell.label} className="rounded-md border border-border bg-surface p-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {cell.label}
                </div>
                <div className="text-sm font-medium">{cell.value}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Itens de orçamento</h2>
          <div className="flex gap-2">
            {canCreate && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    resetImport();
                    setImportDialog(true);
                  }}
                >
                  <Upload className="h-4 w-4" />
                  Importar estimate
                </Button>
                <Button onClick={openCreateItem}>
                  <Plus className="h-4 w-4" />
                  Novo item
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-2.5">Código</th>
                <th className="px-4 py-2.5">Descrição</th>
                <th className="px-4 py-2.5">Categoria</th>
                <th className="px-4 py-2.5 text-right">Qtd</th>
                <th className="px-4 py-2.5 text-right">PU</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5">WBS</th>
                {(canEdit || canDelete) && <th className="px-4 py-2.5 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs">{item.code}</td>
                  <td className="px-4 py-2.5">{item.description}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{item.category}</td>
                  <td className="px-4 py-2.5 text-right">{item.quantity}</td>
                  <td className="px-4 py-2.5 text-right">{brl(item.unitPrice)}</td>
                  <td className="px-4 py-2.5 text-right font-medium">{brl(item.amount)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {item.wbsNodeCode ?? "—"}
                  </td>
                  {(canEdit || canDelete) && (
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Editar item"
                            onClick={() => openEditItem(item)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Remover item"
                            onClick={() => void removeItem(item)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {(data.items.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhum item de orçamento. Importe um estimate ou crie itens manualmente.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Compromissos</h2>
          {canCreate && (
            <Button onClick={openCreateCommitment}>
              <Plus className="h-4 w-4" />
              Novo compromisso
            </Button>
          )}
        </div>
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-2.5">Código</th>
                <th className="px-4 py-2.5">Descrição</th>
                <th className="px-4 py-2.5">Fornecedor</th>
                <th className="px-4 py-2.5">Data</th>
                <th className="px-4 py-2.5 text-right">Valor</th>
                <th className="px-4 py-2.5">Status</th>
                {(canEdit || canDelete) && <th className="px-4 py-2.5 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {data.commitments.map((commitment) => (
                <tr key={commitment.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs">{commitment.code}</td>
                  <td className="px-4 py-2.5">{commitment.description}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {commitment.supplier ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{commitment.committedAt}</td>
                  <td className="px-4 py-2.5 text-right font-medium">{brl(commitment.amount)}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={commitment.status === "OPEN" ? "default" : "secondary"}>
                      {commitment.status === "OPEN"
                        ? "Aberto"
                        : commitment.status === "CLOSED"
                          ? "Encerrado"
                          : "Cancelado"}
                    </Badge>
                  </td>
                  {(canEdit || canDelete) && (
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Editar compromisso"
                            onClick={() => openEditCommitment(commitment)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Remover compromisso"
                            onClick={() => void removeCommitment(commitment)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {(data.commitments.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhum compromisso registrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Custos realizados</h2>
          {canCreate && (
            <Button onClick={openCreateActual}>
              <Plus className="h-4 w-4" />
              Novo realizado
            </Button>
          )}
        </div>
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-2.5">Código</th>
                <th className="px-4 py-2.5">Descrição</th>
                <th className="px-4 py-2.5">Data</th>
                <th className="px-4 py-2.5">Item</th>
                <th className="px-4 py-2.5 text-right">Valor</th>
                {canDelete && <th className="px-4 py-2.5 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {data.actuals.map((actual) => (
                <tr key={actual.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs">{actual.code}</td>
                  <td className="px-4 py-2.5">{actual.description}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{actual.incurredAt}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {actual.costItemCode ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">{brl(actual.amount)}</td>
                  {canDelete && (
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Remover realizado"
                        onClick={() => void removeActual(actual)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
              {(data.actuals.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhum custo realizado registrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Baseline de custo</h2>
          {canCreate && (
            <Button onClick={() => void createBaseline()} disabled={busy}>
              <Plus className="h-4 w-4" />
              Nova baseline
            </Button>
          )}
        </div>
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-2.5">Versão</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Mudança</th>
                <th className="px-4 py-2.5">Itens</th>
                <th className="px-4 py-2.5 text-right">Orçamento</th>
                <th className="px-4 py-2.5">Criada em</th>
                <th className="px-4 py-2.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.baselines.map((baseline) => (
                <tr key={baseline.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs">v{baseline.version}</td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant={
                        baseline.status === "APPROVED"
                          ? "default"
                          : baseline.status === "SUPERSEDED"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {BASELINE_BADGE[baseline.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {baseline.changeCode ? (
                      <span
                        className="font-mono text-xs text-primary"
                        title={`Revisão originada pela mudança ${baseline.changeCode}`}
                      >
                        {baseline.changeCode}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{baseline.itemCount}</td>
                  <td className="px-4 py-2.5 text-right font-medium">
                    {brl(baseline.totalBudget)}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {new Date(baseline.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      {canEdit && baseline.status === "DRAFT" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Submeter"
                          onClick={() => void transitionBaseline(baseline.id, "SUBMIT")}
                        >
                          <Upload className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canApprove && (baseline.status === "DRAFT" || baseline.status === "SUBMITTED") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Aprovar"
                          onClick={() => void transitionBaseline(baseline.id, "APPROVE")}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {(data.baselines.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhuma baseline de custo. Crie uma para congelar o orçamento (exigido no G4).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog
        open={itemDialog}
        title={editingItemId ? "Editar item" : "Novo item de orçamento"}
        onClose={() => setItemDialog(false)}
        wide
      >
        <div className="flex flex-col gap-4">
          <ErrorBox message={error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="item-code">Código</Label>
              <Input
                id="item-code"
                value={itemForm.code}
                onChange={(event) => setItem("code", event.target.value.toUpperCase())}
                placeholder="ORC001"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="item-category">Categoria</Label>
              <Input
                id="item-category"
                value={itemForm.category}
                onChange={(event) => setItem("category", event.target.value)}
                placeholder="Grupo 1 — Projetos"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="item-description">Descrição *</Label>
            <Input
              id="item-description"
              value={itemForm.description}
              onChange={(event) => setItem("description", event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="item-unit">Unidade *</Label>
              <Input
                id="item-unit"
                value={itemForm.unit}
                onChange={(event) => setItem("unit", event.target.value)}
                placeholder="m², un, kg…"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="item-qty">Quantidade *</Label>
              <Input
                id="item-qty"
                type="number"
                value={itemForm.quantity}
                onChange={(event) => setItem("quantity", event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="item-pu">Preço unitário *</Label>
              <Input
                id="item-pu"
                type="number"
                step="0.01"
                value={itemForm.unitPrice}
                onChange={(event) => setItem("unitPrice", event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="item-wbs">Nó de WBS (opcional)</Label>
            <select
              id="item-wbs"
              value={itemForm.wbsNodeId}
              onChange={(event) => setItem("wbsNodeId", event.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">— sem vínculo —</option>
              {wbsNodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.code} — {node.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setItemDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void submitItem()}
              disabled={busy || !itemForm.description || !itemForm.unit}
            >
              {busy ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={commitmentDialog}
        title={editingCommitmentId ? "Editar compromisso" : "Novo compromisso"}
        onClose={() => setCommitmentDialog(false)}
        wide
      >
        <div className="flex flex-col gap-4">
          <ErrorBox message={error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="commit-code">Código</Label>
              <Input
                id="commit-code"
                value={commitmentForm.code}
                onChange={(event) => setCommitment("code", event.target.value.toUpperCase())}
                placeholder="CT001"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="commit-supplier">Fornecedor</Label>
              <Input
                id="commit-supplier"
                value={commitmentForm.supplier}
                onChange={(event) => setCommitment("supplier", event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="commit-description">Descrição *</Label>
            <Input
              id="commit-description"
              value={commitmentForm.description}
              onChange={(event) => setCommitment("description", event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="commit-amount">Valor *</Label>
              <Input
                id="commit-amount"
                type="number"
                step="0.01"
                value={commitmentForm.amount}
                onChange={(event) => setCommitment("amount", event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="commit-date">Data *</Label>
              <Input
                id="commit-date"
                type="date"
                value={commitmentForm.committedAt}
                onChange={(event) => setCommitment("committedAt", event.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCommitmentDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void submitCommitment()}
              disabled={busy || !commitmentForm.description}
            >
              {busy ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={actualDialog}
        title="Novo custo realizado"
        onClose={() => setActualDialog(false)}
        wide
      >
        <div className="flex flex-col gap-4">
          <ErrorBox message={error} />
          <div className="grid gap-2">
            <Label htmlFor="actual-description">Descrição *</Label>
            <Input
              id="actual-description"
              value={actualForm.description}
              onChange={(event) => setActual("description", event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="actual-amount">Valor *</Label>
              <Input
                id="actual-amount"
                type="number"
                step="0.01"
                value={actualForm.amount}
                onChange={(event) => setActual("amount", event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="actual-date">Data *</Label>
              <Input
                id="actual-date"
                type="date"
                value={actualForm.incurredAt}
                onChange={(event) => setActual("incurredAt", event.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setActualDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void submitActual()} disabled={busy || !actualForm.description}>
              {busy ? "Salvando…" : "Registrar"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={importDialog}
        title="Importar estimate de cozinha"
        onClose={() => {
          setImportDialog(false);
          resetImport();
        }}
        wide
      >
        <div className="flex flex-col gap-4">
          <ErrorBox message={error} />
          <p className="text-sm text-muted-foreground">
            Envie o JSON exportado de <strong>/orcamento</strong> (arquivo{" "}
            <code>.json</code>) ou cole o conteúdo abaixo. Os itens vivos do projeto
            serão substituídos.
          </p>

          {/* Zona de upload (arquivo .json) */}
          <label
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              void onImportFile(event.dataTransfer.files?.[0]);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-6 text-center transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-border hover:bg-surface-hover"
            }`}
          >
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(event) => void onImportFile(event.target.files?.[0])}
            />
            <FileJson className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm">
              {importFileName ? (
                <span className="font-medium">{importFileName}</span>
              ) : (
                <>
                  Arraste o arquivo <code>.json</code> ou clique para selecionar
                </>
              )}
            </span>
            <span className="text-xs text-muted-foreground">
              Exporte em /orcamento → “Exportar JSON”
            </span>
          </label>

          {/* Fallback: colar o conteúdo */}
          <div className="grid gap-2">
            <Label htmlFor="import-json">Ou cole o JSON</Label>
            <textarea
              id="import-json"
              value={importText}
              onChange={(event) => parseImport(event.target.value)}
              rows={8}
              placeholder='{"quantitativos":[…]}'
              className="rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs"
            />
          </div>

          {importError && <ErrorBox message={importError} />}

          {/* Preview do que foi extraído */}
          {importPreview && (
            <div className="rounded-md border border-border bg-surface p-3">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">Prévia da importação</span>
                <span className="text-muted-foreground">
                  {importPreview.lineCount} linha{importPreview.lineCount === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mb-2 text-lg font-semibold">
                {brl(importPreview.totalDirect)}{" "}
                <span className="text-xs font-normal text-muted-foreground">custo direto</span>
              </div>
              {importPreview.groups.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {importPreview.groups.map((group) => (
                    <Badge key={group.grupo} variant="secondary" className="text-[11px]">
                      {group.grupo} · {group.grupoNome}: {brl(group.total)}
                    </Badge>
                  ))}
                </div>
              )}
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-1 pr-2">Descrição</th>
                    <th className="py-1 pr-2 text-right">Qtd</th>
                    <th className="py-1 pr-2 text-right">PU</th>
                    <th className="py-1 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.firstLines.map((line, index) => (
                    <tr key={index} className="border-b border-border/50 last:border-0">
                      <td className="py-1 pr-2">{line.descricao}</td>
                      <td className="py-1 pr-2 text-right">{line.quantidade}</td>
                      <td className="py-1 pr-2 text-right">{brl(line.pu)}</td>
                      <td className="py-1 text-right">{brl(line.custoTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {importPreview.lineCount > importPreview.firstLines.length && (
                <p className="mt-1 text-xs text-muted-foreground">
                  … e mais {importPreview.lineCount - importPreview.firstLines.length} linha(s).
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setImportDialog(false);
                resetImport();
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void importEstimate()}
              disabled={busy || !importPreview}
            >
              {busy ? "Importando…" : "Importar"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
