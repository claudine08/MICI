"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Template = "equipment" | "services" | "projects" | "other";

function templateFor(category: string | null | undefined): Template {
  if (category === "EQUIPAMENTOS" || category === "MATERIAIS") return "equipment";
  if (category === "SERVICOS" || category === "EMPREITEIRO") return "services";
  if (category === "PROJETOS") return "projects";
  return "other";
}

const TEMPLATE_LABELS: Record<Template, { amount: string; lead: string; title: string }> = {
  equipment: { title: "Resposta — Equipamentos / Materiais", amount: "Valor cotado (equipamento/material)", lead: "Prazo de entrega (dias)" },
  services: { title: "Resposta — Serviços", amount: "Valor do serviço", lead: "Prazo de execução (dias)" },
  projects: { title: "Resposta — Projetos / Consultoria", amount: "Valor do projeto", lead: "Prazo de entrega (dias)" },
  other: { title: "Resposta de RFI", amount: "Valor cotado", lead: "Prazo de entrega (dias)" },
};

export function RfiResponseView({ token, data }: { token: string; data: any }) {
  const template = templateFor(data?.recipient?.requestedCategory ?? (data?.recipient?.supplierCategories?.[0] ?? null));
  const labels = TEMPLATE_LABELS[template];

  const [quotedAmount, setQuotedAmount] = useState(data?.recipient?.quotedAmount ?? "");
  const [leadTimeDays, setLeadTimeDays] = useState(data?.recipient?.leadTimeDays != null ? String(data.recipient.leadTimeDays) : "");
  const [notes, setNotes] = useState(data?.recipient?.notes ?? "");

  // Campos adicionais por template
  const [extra1, setExtra1] = useState("");
  const [extra2, setExtra2] = useState("");

  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extraLabels: Record<Template, { first?: string; second?: string }> = {
    equipment: { first: "Marca / Modelo", second: "Garantia (meses)" },
    services: { first: "Escopo do serviço", second: "Equipe alocada" },
    projects: { first: "Entregáveis", second: "Metodologia / abordagem" },
    other: {},
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      // Compõe as observações incluindo os campos específicos do template
      const parts: string[] = [];
      if (extraLabels[template].first && extra1.trim()) parts.push(`${extraLabels[template].first}: ${extra1.trim()}`);
      if (extraLabels[template].second && extra2.trim()) parts.push(`${extraLabels[template].second}: ${extra2.trim()}`);
      if (notes.trim()) parts.push(`Observações: ${notes.trim()}`);
      const composedNotes = parts.length ? parts.join("\n") : null;

      const res = await fetch(`/api/v1/rfi-responses/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quotedAmount: quotedAmount ? Number(quotedAmount) : undefined,
          leadTimeDays: leadTimeDays ? Number(leadTimeDays) : undefined,
          notes: composedNotes,
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
      <h1 className="text-2xl font-semibold mb-2">{labels.title}</h1>
      {rfi && (
        <div className="mb-4 rounded border p-3 text-sm">
          <div className="font-medium">{rfi.code} — {rfi.title}</div>
          {rfi.description && <div className="text-muted-foreground mt-1">{rfi.description}</div>}
          {rfi.dueDate && <div className="text-muted-foreground mt-1">Prazo: {rfi.dueDate}</div>}
        </div>
      )}
      {recipient && <div className="mb-4 text-sm">Fornecedor: <strong>{recipient.supplierName}</strong>{recipient.requestedCategory ? ` — Categoria solicitada: ${recipient.requestedCategory}` : ""}</div>}
      {done ? (
        <div className="rounded border border-emerald-300 bg-emerald-50 p-4 text-emerald-700">Resposta enviada com sucesso. Obrigado!</div>
      ) : (
        <div className="space-y-3">
          <div>
            <Label>{labels.amount}</Label>
            <Input value={quotedAmount} onChange={(e) => setQuotedAmount(e.target.value)} type="number" step="0.01" />
          </div>
          <div>
            <Label>{labels.lead}</Label>
            <Input value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)} type="number" />
          </div>
          {extraLabels[template].first && (
            <div>
              <Label>{extraLabels[template].first}</Label>
              <Input value={extra1} onChange={(e) => setExtra1(e.target.value)} />
            </div>
          )}
          {extraLabels[template].second && (
            <div>
              <Label>{extraLabels[template].second}</Label>
              <Input value={extra2} onChange={(e) => setExtra2(e.target.value)} />
            </div>
          )}
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