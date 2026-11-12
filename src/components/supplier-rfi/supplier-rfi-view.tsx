"use client";

import { useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import { Plus, ChevronDown, ChevronRight } from "lucide-react";
import type { SupplierRfiRow } from "@/modules/supplier-rfi/selectors";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";

interface Supplier { id: string; name: string }

export function SupplierRfiView({
  projectId,
  rfis,
  suppliers,
  canCreate,
  canEdit,
}: {
  projectId: string;
  rfis: SupplierRfiRow[];
  suppliers: Supplier[];
  canCreate: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [supplierIds, setSupplierIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [responseOpen, setResponseOpen] = useState(false);
  const [responseRfiId, setResponseRfiId] = useState<string | null>(null);
  const [responseSupplierId, setResponseSupplierId] = useState<string>("");
  const [quotedAmount, setQuotedAmount] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("");
  const [notes, setNotes] = useState("");

  const toggleSupplier = (id: string) => setSupplierIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const toggleExpand = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiRequest("/api/v1/supplier-rfis", {
        method: "POST",
        body: JSON.stringify({ projectId, title, description: description || null, dueDate: dueDate || null, supplierIds }),
      });
      setDialogOpen(false);
      setTitle(""); setDescription(""); setDueDate(""); setSupplierIds([]);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar RFI.");
    } finally {
      setBusy(false);
    }
  };

  const send = async (id: string) => {
    setBusy(true);
    try {
      await apiRequest(`/api/v1/supplier-rfis/${id}/send`, { method: "POST", body: JSON.stringify({}) });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setBusy(false);
    }
  };

  const openResponse = (rfiId: string, supplierId: string, rec?: { quotedAmount?: string | null; leadTimeDays?: number | null; notes?: string | null }) => {
    setResponseRfiId(rfiId);
    setResponseSupplierId(supplierId);
    setQuotedAmount(rec?.quotedAmount ?? "");
    setLeadTimeDays(rec?.leadTimeDays != null ? String(rec.leadTimeDays) : "");
    setNotes(rec?.notes ?? "");
    setResponseOpen(true);
  };

  const submitResponse = async () => {
    if (!responseRfiId) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/v1/supplier-rfis/${responseRfiId}/response`, {
        method: "POST",
        body: JSON.stringify({
          supplierId: responseSupplierId,
          quotedAmount: quotedAmount ? Number(quotedAmount) : undefined,
          leadTimeDays: leadTimeDays ? Number(leadTimeDays) : undefined,
          notes: notes || null,
        }),
      });
      setResponseOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao registrar resposta.");
    } finally {
      setBusy(false);
    }
  };

  const select = async (rfiId: string, supplierId: string) => {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/v1/supplier-rfis/${rfiId}/select`, {
        method: "POST",
        body: JSON.stringify({ supplierId }),
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao selecionar fornecedor.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {canCreate && (
        <div>
          <Button onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Novo RFI de Fornecedores</Button>
        </div>
      )}
      <Dialog open={dialogOpen} title="Novo RFI de Fornecedores" onClose={() => setDialogOpen(false)}>
        <div className="flex flex-col gap-3 p-4">
          <h2 className="text-lg font-semibold">Novo RFI de Fornecedores</h2>
          <div className="grid gap-2">
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Descrição</Label>
            <textarea className="rounded-md border border-border bg-surface px-3 py-2 text-sm" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Prazo</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Fornecedores</Label>
            <div className="flex flex-wrap gap-2">
              {suppliers.map((s) => (
                <label key={s.id} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={supplierIds.includes(s.id)} onChange={() => toggleSupplier(s.id)} />
                  {s.name}
                </label>
              ))}
            </div>
          </div>
          <Button onClick={create} disabled={busy}>Criar</Button>
        </div>
      </Dialog>

      <Dialog open={responseOpen} title="Registrar resposta do fornecedor" onClose={() => setResponseOpen(false)}>
        <div className="flex flex-col gap-3 p-4">
          <h2 className="text-lg font-semibold">Registrar resposta</h2>
          <div className="grid gap-2">
            <Label>Valor cotado</Label>
            <Input type="number" step="0.01" value={quotedAmount} onChange={(e) => setQuotedAmount(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Prazo de entrega (dias)</Label>
            <Input type="number" value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Observações</Label>
            <textarea className="rounded-md border border-border bg-surface px-3 py-2 text-sm" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button onClick={submitResponse} disabled={busy}>Salvar resposta</Button>
        </div>
      </Dialog>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="px-4 py-2.5"></th>
              <th className="px-4 py-2.5">Código</th>
              <th className="px-4 py-2.5">Título</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Fornecedores</th>
              <th className="px-4 py-2.5">Selecionado</th>
              <th className="px-4 py-2.5">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rfis.map((r) => (
              <Fragment key={r.id}>
                <tr className="border-b last:border-0">
                  <td className="px-4 py-2.5">
                    <button onClick={() => toggleExpand(r.id)} className="text-muted-foreground">
                      {expanded[r.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">{r.code}</td>
                  <td className="px-4 py-2.5">{r.title}</td>
                  <td className="px-4 py-2.5">{r.status}</td>
                  <td className="px-4 py-2.5">{r.recipientCount}</td>
                  <td className="px-4 py-2.5">{r.selectedSupplierId ? r.recipients.find((x) => x.supplierId === r.selectedSupplierId)?.supplierName ?? r.selectedSupplierId : "—"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {canEdit && r.status === "DRAFT" && <Button size="sm" onClick={() => send(r.id)}>Enviar</Button>}
                    </div>
                  </td>
                </tr>
                {expanded[r.id] && (
                  <tr key={`${r.id}-exp`} className="border-b bg-muted/30">
                    <td colSpan={7} className="px-4 py-3">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-muted-foreground">
                            <th className="py-1.5">Fornecedor</th>
                            <th className="py-1.5">E-mail</th>
                            <th className="py-1.5">Status</th>
                            <th className="py-1.5">Valor cotado</th>
                            <th className="py-1.5">Prazo (dias)</th>
                            <th className="py-1.5">Respondido em</th>
                            <th className="py-1.5">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.recipients.map((rec) => (
                            <tr key={rec.id} className="border-t border-border/40">
                              <td className="py-1.5">{rec.supplierName}</td>
                              <td className="py-1.5">{rec.supplierEmail ?? "—"}</td>
                              <td className="py-1.5">{rec.status}</td>
                              <td className="py-1.5">{rec.quotedAmount ?? "—"}</td>
                              <td className="py-1.5">{rec.leadTimeDays ?? "—"}</td>
                              <td className="py-1.5">{rec.respondedAt ? new Date(rec.respondedAt).toLocaleString() : "—"}</td>
                              <td className="py-1.5">
                                <div className="flex flex-wrap gap-1">
                                  {canEdit && (r.status === "SENT" || r.status === "RESPONDED") && (
                                    <Button size="sm" variant="outline" onClick={() => openResponse(r.id, rec.supplierId, rec)}>Registrar resposta</Button>
                                  )}
                                  {canEdit && rec.status === "RESPONDED" && r.selectedSupplierId !== rec.supplierId && (
                                    <Button size="sm" onClick={() => select(r.id, rec.supplierId)}>Selecionar</Button>
                                  )}
                                  {r.selectedSupplierId === rec.supplierId && (
                                    <span className="text-xs font-medium text-emerald-600">Selecionado</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                          {r.recipients.length === 0 && (
                            <tr><td colSpan={7} className="py-3 text-center text-muted-foreground">Nenhum fornecedor destinatário.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {rfis.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Nenhum RFI de fornecedores cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
