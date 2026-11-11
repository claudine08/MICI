"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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

  const toggleSupplier = (id: string) => setSupplierIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

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
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="px-4 py-2.5">Código</th>
              <th className="px-4 py-2.5">Título</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Fornecedores</th>
              <th className="px-4 py-2.5">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rfis.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-4 py-2.5 font-mono text-xs">{r.code}</td>
                <td className="px-4 py-2.5">{r.title}</td>
                <td className="px-4 py-2.5">{r.status}</td>
                <td className="px-4 py-2.5">{r.recipientCount}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {canEdit && r.status === "DRAFT" && <Button size="sm" onClick={() => send(r.id)}>Enviar</Button>}
                  </div>
                </td>
              </tr>
            ))}
            {rfis.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Nenhum RFI de fornecedores cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}