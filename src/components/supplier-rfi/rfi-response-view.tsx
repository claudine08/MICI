"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RfiResponseView({ token, data }: { token: string; data: any }) {
  const [quotedAmount, setQuotedAmount] = useState(data?.recipient?.quotedAmount ?? "");
  const [leadTimeDays, setLeadTimeDays] = useState(data?.recipient?.leadTimeDays != null ? String(data.recipient.leadTimeDays) : "");
  const [notes, setNotes] = useState(data?.recipient?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/rfi-responses/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quotedAmount: quotedAmount ? Number(quotedAmount) : undefined,
          leadTimeDays: leadTimeDays ? Number(leadTimeDays) : undefined,
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? "Erro ao enviar resposta.");
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setBusy(false);
    }
  };

  const rfi = data?.rfi;
  const recipient = data?.recipient;

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold mb-2">Resposta de RFI</h1>
      {rfi && (
        <div className="mb-4 rounded border p-3 text-sm">
          <div className="font-medium">{rfi.code} — {rfi.title}</div>
          {rfi.description && <div className="text-muted-foreground mt-1">{rfi.description}</div>}
          {rfi.dueDate && <div className="text-muted-foreground mt-1">Prazo: {rfi.dueDate}</div>}
        </div>
      )}
      {recipient && <div className="mb-4 text-sm">Fornecedor: <strong>{recipient.supplierName}</strong></div>}
      {done ? (
        <div className="rounded border border-emerald-300 bg-emerald-50 p-4 text-emerald-700">Resposta enviada com sucesso. Obrigado!</div>
      ) : (
        <div className="space-y-3">
          <div>
            <Label>Valor cotado</Label>
            <Input value={quotedAmount} onChange={(e) => setQuotedAmount(e.target.value)} type="number" step="0.01" />
          </div>
          <div>
            <Label>Prazo de entrega (dias)</Label>
            <Input value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)} type="number" />
          </div>
          <div>
            <Label>Observações</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={submit} disabled={busy}>{busy ? "Enviando..." : "Enviar resposta"}</Button>
        </div>
      )}
    </div>
  );
}