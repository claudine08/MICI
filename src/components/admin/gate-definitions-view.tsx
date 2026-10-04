"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { GateDefinitionRow } from "@/modules/gates/definitions";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

const PHASE_OPTIONS = [
  ["F0", "F0 · Oportunidade"],
  ["F1", "F1 · Descoberta e Requisitos"],
  ["F2", "F2 · Viabilidade e Concepção"],
  ["F3", "F3 · Orçamentação"],
  ["F4", "F4 · Contratação e Mobilização"],
  ["F5", "F5 · Projeto Executivo"],
  ["F6", "F6 · Suprimentos"],
  ["F7", "F7 · Execução"],
  ["F8", "F8 · Entrega"],
  ["F9", "F9 · Encerramento"],
  ["F10", "F10 · Pós-ocupação / Garantia"],
] as const;

interface CriterionDraft {
  description: string;
  required: boolean;
}

interface DefinitionForm {
  code: string;
  name: string;
  description: string;
  phase: string;
  required: boolean;
  requiresEvidence: boolean;
  minimumApprovals: number;
  criteria: CriterionDraft[];
}

const emptyForm: DefinitionForm = {
  code: "",
  name: "",
  description: "",
  phase: "F0",
  required: true,
  requiresEvidence: true,
  minimumApprovals: 1,
  criteria: [{ description: "", required: true }],
};

export function GateDefinitionsView({
  definitions,
  canEdit,
  canCreate,
  canDelete,
}: {
  definitions: GateDefinitionRow[];
  canEdit: boolean;
  canCreate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DefinitionForm>(emptyForm);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = (definition: GateDefinitionRow) => {
    setEditingId(definition.id);
    setForm({
      code: definition.code,
      name: definition.name,
      description: definition.description ?? "",
      phase: definition.phase,
      required: definition.required,
      requiresEvidence: definition.requiresEvidence,
      minimumApprovals: definition.minimumApprovals,
      criteria: definition.criteria.map((criterion) => ({
        description: criterion.description,
        required: criterion.required,
      })),
    });
    setError(null);
    setDialogOpen(true);
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const payload = {
        ...(editingId ? {} : { code: form.code }),
        name: form.name,
        description: form.description,
        phase: form.phase,
        required: form.required,
        requiresEvidence: form.requiresEvidence,
        minimumApprovals: form.minimumApprovals,
        criteria: form.criteria.filter((criterion) => criterion.description.trim()),
      };
      if (editingId) {
        await apiRequest(`/api/v1/gate-definitions/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest("/api/v1/gate-definitions", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setDialogOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar gate.");
    } finally {
      setBusy(false);
    }
  };

  const removeDefinition = async (definition: GateDefinitionRow) => {
    if (!window.confirm(`Remover o gate ${definition.code} — ${definition.name}?`)) return;
    setError(null);
    try {
      await apiRequest(`/api/v1/gate-definitions/${definition.id}`, { method: "DELETE" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao remover.");
    }
  };

  const setCriterion = (index: number, patch: Partial<CriterionDraft>) =>
    setForm((previous) => ({
      ...previous,
      criteria: previous.criteria.map((criterion, i) =>
        i === index ? { ...criterion, ...patch } : criterion
      ),
    }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {definitions.length} gate(s) · a definição vale para novos projetos; projetos
          existentes mantêm o snapshot (§15.1).
        </p>
        {canCreate && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Novo gate
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
              <th className="px-4 py-2.5">Fase</th>
              <th className="px-4 py-2.5">Regras</th>
              <th className="px-4 py-2.5">Critérios</th>
              <th className="px-4 py-2.5">Projetos</th>
              {(canEdit || canDelete) && <th className="px-4 py-2.5 text-right">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {definitions.map((definition) => (
              <tr key={definition.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5">
                  <span className="font-mono text-xs">{definition.code}</span>
                  {definition.isSystem && (
                    <Badge variant="secondary" className="ml-2">
                      Sistema
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-2.5 font-medium">{definition.name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{definition.phase}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {definition.required && <Badge variant="warning">BR-001</Badge>}
                    {definition.requiresEvidence && <Badge variant="secondary">Evidência</Badge>}
                    {definition.minimumApprovals > 1 && (
                      <Badge variant="outline">{definition.minimumApprovals} aprovações</Badge>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{definition.criteria.length}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{definition.activeProjects}</td>
                {(canEdit || canDelete) && (
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Editar gate"
                          onClick={() => openEdit(definition)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canDelete && !definition.isSystem && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Remover gate"
                          onClick={() => void removeDefinition(definition)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {definitions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum gate configurado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={dialogOpen}
        title={editingId ? `Editar gate ${form.code}` : "Novo gate"}
        onClose={() => setDialogOpen(false)}
        wide
      >
        <div className="flex flex-col gap-4">
          <ErrorBox message={error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="gate-code">Código *</Label>
              <Input
                id="gate-code"
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
                placeholder="G9"
                disabled={!!editingId}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gate-name">Nome *</Label>
              <Input
                id="gate-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gate-phase">Fase bloqueada (BR-001)</Label>
              <select
                id="gate-phase"
                value={form.phase}
                onChange={(event) => setForm({ ...form, phase: event.target.value })}
                className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
              >
                {PHASE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gate-min-approvals">Aprovações necessárias</Label>
              <Input
                id="gate-min-approvals"
                type="number"
                min={1}
                max={10}
                value={form.minimumApprovals}
                onChange={(event) =>
                  setForm({ ...form, minimumApprovals: Number(event.target.value) || 1 })
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.required}
                onChange={(event) => setForm({ ...form, required: event.target.checked })}
              />
              Obrigatório para avançar de fase (BR-001)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.requiresEvidence}
                onChange={(event) => setForm({ ...form, requiresEvidence: event.target.checked })}
              />
              Exigir evidência para aprovação (BR-002)
            </label>
          </div>

          <div className="grid gap-2">
            <Label>Critérios *</Label>
            <div className="flex flex-col gap-2 rounded-md border border-border p-3">
              {form.criteria.map((criterion, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={criterion.description}
                    onChange={(event) => setCriterion(index, { description: event.target.value })}
                    placeholder={`Critério ${index + 1}`}
                  />
                  <label
                    className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
                    title="Obrigatório"
                  >
                    <input
                      type="checkbox"
                      checked={criterion.required}
                      onChange={(event) => setCriterion(index, { required: event.target.checked })}
                    />
                    Obrig.
                  </label>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Remover critério"
                    onClick={() =>
                      setForm((previous) => ({
                        ...previous,
                        criteria: previous.criteria.filter((_, i) => i !== index),
                      }))
                    }
                    disabled={form.criteria.length === 1}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setForm((previous) => ({
                    ...previous,
                    criteria: [...previous.criteria, { description: "", required: true }],
                  }))
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar critério
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void submit()}
              disabled={
                busy ||
                !form.name ||
                (!editingId && !form.code) ||
                form.criteria.filter((criterion) => criterion.description.trim()).length === 0
              }
            >
              {busy ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
