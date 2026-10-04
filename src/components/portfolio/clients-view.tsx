"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { ClientRow } from "@/modules/portfolio/selectors";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

interface ClientForm {
  code: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
}

const emptyForm: ClientForm = { code: "", name: "", email: "", phone: "", address: "", notes: "" };

export function ClientsView({
  clients,
  canCreate,
  canEdit,
  canDelete,
}: {
  clients: ClientRow[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ClientForm>(emptyForm);

  const set = (key: keyof ClientForm, value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = (client: ClientRow) => {
    setEditingId(client.id);
    setForm({
      code: client.code ?? "",
      name: client.name,
      email: client.email ?? "",
      phone: client.phone ?? "",
      address: client.address ?? "",
      notes: client.notes ?? "",
    });
    setError(null);
    setDialogOpen(true);
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const payload = {
        code: form.code || undefined,
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
        notes: form.notes || undefined,
      };
      if (editingId) {
        await apiRequest(`/api/v1/clients/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({ ...payload, code: form.code || null }),
        });
      } else {
        await apiRequest("/api/v1/clients", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setDialogOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar cliente.");
    } finally {
      setBusy(false);
    }
  };

  const removeClient = async (client: ClientRow) => {
    if (!window.confirm(`Remover o cliente ${client.name}?`)) return;
    setError(null);
    try {
      await apiRequest(`/api/v1/clients/${client.id}`, { method: "DELETE" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao remover.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {clients.length} cliente{clients.length === 1 ? "" : "s"} · clientes com projetos
          ativos não podem ser removidos.
        </p>
        {canCreate && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Novo cliente
          </Button>
        )}
      </div>

      <ErrorBox message={error} />

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="px-4 py-2.5">Código</th>
              <th className="px-4 py-2.5">Nome</th>
              <th className="px-4 py-2.5">Contato</th>
              <th className="px-4 py-2.5">Projetos</th>
              {(canEdit || canDelete) && <th className="px-4 py-2.5 text-right">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5 font-mono text-xs">{client.code ?? "—"}</td>
                <td className="px-4 py-2.5 font-medium">{client.name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {client.email ?? client.phone ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{client.projectCount}</td>
                {(canEdit || canDelete) && (
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Editar cliente"
                          onClick={() => openEdit(client)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Remover cliente"
                          onClick={() => void removeClient(client)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum cliente cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={dialogOpen}
        title={editingId ? "Editar cliente" : "Novo cliente"}
        onClose={() => setDialogOpen(false)}
        wide
      >
        <div className="flex flex-col gap-4">
          <ErrorBox message={error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="client-code">Código</Label>
              <Input
                id="client-code"
                value={form.code}
                onChange={(event) => set("code", event.target.value.toUpperCase())}
                placeholder="CLI-001"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="client-name">Nome *</Label>
              <Input
                id="client-name"
                value={form.name}
                onChange={(event) => set("name", event.target.value)}
                placeholder="Razão social"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="client-email">E-mail</Label>
              <Input
                id="client-email"
                type="email"
                value={form.email}
                onChange={(event) => set("email", event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="client-phone">Telefone</Label>
              <Input
                id="client-phone"
                value={form.phone}
                onChange={(event) => set("phone", event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="client-address">Endereço</Label>
            <Input
              id="client-address"
              value={form.address}
              onChange={(event) => set("address", event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="client-notes">Observações</Label>
            <textarea
              id="client-notes"
              value={form.notes}
              onChange={(event) => set("notes", event.target.value)}
              rows={3}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void submit()} disabled={busy || !form.name}>
              {busy ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
