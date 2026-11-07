"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Zap, Power } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";

// Painel de webhooks outbound (Fase I3): CRUD + teste de entrega + últimas
// entregas. Recebe os dados já carregados pelo server component da página e
// usa as APIs existentes em /api/v1/organizations/[orgId]/webhooks*.

export interface WebhookEndpointRow {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  description: string | null;
  createdAt: string;
  deliveryCount: number;
  circuit: "closed" | "open" | "half_open";
}

export interface WebhookDeliveryRow {
  id: string;
  endpointId: string;
  eventType: string;
  status: string;
  attempts: number;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

function Message({ kind, message }: { kind: "error" | "info"; message: string | null }) {
  if (!message) return null;
  return kind === "error" ? (
    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  ) : (
    <p className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
      {message}
    </p>
  );
}

function statusVariant(status: string): "success" | "destructive" | "warning" | "secondary" {
  if (status === "DELIVERED" || status === "SUCCESS") return "success";
  if (status === "FAILED") return "destructive";
  if (status === "PENDING" || status === "RUNNING") return "warning";
  return "secondary";
}

export function WebhooksPanel({
  organizationId,
  endpoints,
  deliveries,
  canCreate,
  canEdit,
  canAdmin,
  canDelete,
}: {
  organizationId: string;
  endpoints: WebhookEndpointRow[];
  deliveries: WebhookDeliveryRow[];
  canCreate: boolean;
  canEdit: boolean;
  canAdmin: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [events, setEvents] = useState("");
  const [isActive, setIsActive] = useState(true);

  const base = `/api/v1/organizations/${organizationId}/webhooks`;
  const urlById = new Map(endpoints.map((endpoint) => [endpoint.id, endpoint.url]));

  const resetDialog = () => {
    setUrl("");
    setDescription("");
    setEvents("");
    setIsActive(true);
    setError(null);
  };

  const openCreate = () => {
    setEditingId(null);
    resetDialog();
    setDialogOpen(true);
  };

  const openEdit = (endpoint: WebhookEndpointRow) => {
    setEditingId(endpoint.id);
    setUrl(endpoint.url);
    setDescription(endpoint.description ?? "");
    setEvents(endpoint.events.join(", "));
    setIsActive(endpoint.isActive);
    setError(null);
    setDialogOpen(true);
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const payload = {
        url: url.trim(),
        description: description.trim() || undefined,
        events: events
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        isActive,
      };
      if (editingId) {
        await apiRequest(`${base}/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({
            ...payload,
            description: description.trim() || null,
          }),
        });
      } else {
        await apiRequest(base, { method: "POST", body: JSON.stringify(payload) });
      }
      setDialogOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar webhook.");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (endpoint: WebhookEndpointRow) => {
    setError(null);
    try {
      await apiRequest(`${base}/${endpoint.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !endpoint.isActive }),
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao alterar status.");
    }
  };

  const remove = async (endpoint: WebhookEndpointRow) => {
    if (!window.confirm(`Excluir o webhook ${endpoint.url}?`)) return;
    setError(null);
    try {
      await apiRequest(`${base}/${endpoint.id}`, { method: "DELETE" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao excluir.");
    }
  };

  const test = async (endpoint: WebhookEndpointRow) => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const result = await apiRequest<{ delivery: { status: string; lastError: string | null } }>(
        `${base}/${endpoint.id}/test`,
        { method: "POST" }
      );
      if (result.delivery.status === "DELIVERED") {
        setInfo(`Teste entregue com sucesso para ${endpoint.url}.`);
      } else {
        setError(
          `Teste falhou (${result.delivery.status}): ${result.delivery.lastError ?? "sem detalhe"}.`
        );
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao testar webhook.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {endpoints.length} endpoint{endpoints.length === 1 ? "" : "s"} · assinatura HMAC
          (X-MICI-Signature) com retry e dead-letter.
        </p>
        {canCreate && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Novo webhook
          </Button>
        )}
      </div>

      <Message kind="error" message={error} />
      <Message kind="info" message={info} />

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="px-4 py-2.5">URL</th>
              <th className="px-4 py-2.5">Eventos</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Entregas</th>
              <th className="px-4 py-2.5">Circuito</th>
              {canEdit && <th className="px-4 py-2.5 text-right">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {endpoints.map((endpoint) => (
              <tr key={endpoint.id} className="border-b border-border last:border-0">
                <td className="max-w-md truncate px-4 py-2.5 font-medium" title={endpoint.url}>
                  {endpoint.url}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {endpoint.events.length === 0 ? (
                      <Badge variant="outline">todos</Badge>
                    ) : (
                      endpoint.events.map((eventType) => (
                        <Badge key={eventType} variant="secondary">
                          {eventType}
                        </Badge>
                      ))
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  {endpoint.isActive ? (
                    <Badge variant="success">Ativo</Badge>
                  ) : (
                    <Badge variant="secondary">Inativo</Badge>
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{endpoint.deliveryCount}</td>
                <td className="px-4 py-2.5">
                  <Badge
                    variant={
                      endpoint.circuit === "closed"
                        ? "success"
                        : endpoint.circuit === "half_open"
                          ? "warning"
                          : "destructive"
                    }
                  >
                    {endpoint.circuit === "closed"
                      ? "fechado"
                      : endpoint.circuit === "half_open"
                        ? "meio-aberto"
                        : "aberto"}
                  </Badge>
                </td>
                {canEdit && (
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      {canAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Testar entrega"
                          onClick={() => void test(endpoint)}
                          disabled={busy}
                        >
                          <Zap className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        title={endpoint.isActive ? "Desativar" : "Ativar"}
                        onClick={() => void toggleActive(endpoint)}
                      >
                        <Power className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Editar webhook"
                        onClick={() => openEdit(endpoint)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Excluir webhook"
                          onClick={() => void remove(endpoint)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {endpoints.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum webhook cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="text-sm font-medium">Últimas entregas</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-2.5">Evento</th>
                <th className="px-4 py-2.5">Endpoint</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Tentativas</th>
                <th className="px-4 py-2.5">Quando</th>
                <th className="px-4 py-2.5">Erro</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery) => (
                <tr key={delivery.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">{delivery.eventType}</td>
                  <td className="max-w-56 truncate px-4 py-2.5 text-muted-foreground">
                    {urlById.get(delivery.endpointId) ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={statusVariant(delivery.status)}>{delivery.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{delivery.attempts}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {dateFormatter.format(new Date(delivery.createdAt))}
                  </td>
                  <td className="max-w-56 truncate px-4 py-2.5 text-muted-foreground">
                    {delivery.lastError ?? "—"}
                  </td>
                </tr>
              ))}
              {deliveries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhuma entrega registrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog
        open={dialogOpen}
        title={editingId ? "Editar webhook" : "Novo webhook"}
        onClose={() => setDialogOpen(false)}
        wide
      >
        <div className="flex flex-col gap-4">
          <Message kind="error" message={error} />
          <div className="grid gap-2">
            <Label htmlFor="wh-url">URL de destino *</Label>
            <Input
              id="wh-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://sistema.cliente.com/webhooks/mici"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="wh-description">Descrição (opcional)</Label>
            <Input
              id="wh-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Para que serve este endpoint"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="wh-events">Eventos (separados por vírgula)</Label>
            <Input
              id="wh-events"
              value={events}
              onChange={(event) => setEvents(event.target.value)}
              placeholder="Project.Created, Member.Updated"
            />
            <p className="text-xs text-muted-foreground">
              Em branco = todos os eventos da organização.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
            />
            Ativo (recebe entregas)
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void submit()}
              disabled={busy || !/^https?:\/\//.test(url.trim())}
            >
              {busy ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
