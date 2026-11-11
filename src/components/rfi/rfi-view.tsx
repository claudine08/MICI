"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { RfiRow } from "@/modules/rfi/selectors";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";

interface Member { id: string; name: string }

export function RfiView({
  projectId,
  rfis,
  members,
  canCreate,
  canEdit,
  canDelete,
  currentUserId,
}: {
  projectId: string;
  rfis: RfiRow[];
  members: Member[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answerFor, setAnswerFor] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiRequest("/api/v1/rfis", {
        method: "POST",
        body: JSON.stringify({ projectId, title, question, recipientId: recipientId || null, dueDate: dueDate || null }),
      });
      setDialogOpen(false);
      setTitle(""); setQuestion(""); setRecipientId(""); setDueDate("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar RFI.");
    } finally {
      setBusy(false);
    }
  };

  const answer = async (id: string) => {
    setBusy(true);
    try {
      await apiRequest(`/api/v1/rfis/${id}/answer`, { method: "POST", body: JSON.stringify({ response: answerText }) });
      setAnswerFor(null);
      setAnswerText("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setBusy(false);
    }
  };

  const transition = async (id: string, action: string) => {
    setBusy(true);
    try {
      await apiRequest(`/api/v1/rfis/${id}/status`, { method: "POST", body: JSON.stringify({ action }) });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await apiRequest(`/api/v1/rfis/${id}`, { method: "DELETE" });
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
          <Button onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Novo RFI</Button>
        </div>
      )}
      <Dialog open={dialogOpen} title="Novo RFI" onClose={() => setDialogOpen(false)}>
        <div className="flex flex-col gap-3 p-4">
          <h2 className="text-lg font-semibold">Novo RFI</h2>
          <div className="grid gap-2">
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Pergunta</Label>
            <textarea className="rounded-md border border-border bg-surface px-3 py-2 text-sm" rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Destinatário</Label>
            <select className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={recipientId} onChange={(e) => setRecipientId(e.target.value)}>
              <option value="">Sem destinatário</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="grid gap-2">
            <Label>Prazo</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
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
              <th className="px-4 py-2.5">Destinatário</th>
              <th className="px-4 py-2.5">Prazo</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Resposta</th>
              <th className="px-4 py-2.5">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rfis.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-4 py-2.5 font-mono text-xs">{r.code}</td>
                <td className="px-4 py-2.5">{r.title}</td>
                <td className="px-4 py-2.5">{r.recipientName ?? "—"}</td>
                <td className="px-4 py-2.5">{r.dueDate ?? "—"}</td>
                <td className="px-4 py-2.5">{r.status}</td>
                <td className="px-4 py-2.5">{r.response ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {r.status === "OPEN" && r.recipientId === currentUserId && (
                      <Button size="sm" onClick={() => setAnswerFor(r.id)}>Responder</Button>
                    )}
                    {canEdit && r.status === "ANSWERED" && <Button size="sm" onClick={() => transition(r.id, "CLOSE")}>Encerrar</Button>}
                    {canEdit && r.status !== "CLOSED" && r.status !== "CANCELLED" && <Button size="sm" variant="destructive" onClick={() => transition(r.id, "CANCEL")}>Cancelar</Button>}
                    {canEdit && (r.status === "CANCELLED" || r.status === "CLOSED") && <Button size="sm" onClick={() => transition(r.id, "REOPEN")}>Reabrir</Button>}
                    {canDelete && <Button size="sm" variant="destructive" onClick={() => remove(r.id)}>Excluir</Button>}
                  </div>
                  {answerFor === r.id && (
                    <div className="mt-2 flex flex-col gap-2">
                      <textarea className="rounded-md border border-border bg-surface px-3 py-2 text-sm" rows={2} value={answerText} onChange={(e) => setAnswerText(e.target.value)} />
                      <Button size="sm" onClick={() => answer(r.id)}>Enviar resposta</Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {rfis.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Nenhum RFI cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}