"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, ClipboardCheck, Paperclip, ExternalLink } from "lucide-react";
import type { RequirementRow, RequirementEvidenceRow } from "@/modules/requirements/selectors";
import {
  allowedRequirementTransitions,
  REQUIREMENT_CATEGORY_LABELS,
  REQUIREMENT_PRIORITY_LABELS,
  REQUIREMENT_STATUS_LABELS,
  type RequirementCategoryValue,
  type RequirementPriorityValue,
  type RequirementStatusValue,
} from "@/modules/requirements/engine";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";

// Requisitos do projeto (E04-US01…US05): cadastro, transição de status,
// evidências (BR-008), revisão do DRP e exportação.

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  DRAFT: "secondary",
  ACTIVE: "default",
  COMPLETED: "success",
  CANCELLED: "destructive",
};

const PRIORITY_VARIANT: Record<string, BadgeVariant> = {
  LOW: "secondary",
  MEDIUM: "default",
  HIGH: "warning",
  CRITICAL: "destructive",
};

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

interface RequirementForm {
  code: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  source: string;
  sourceValidUntil: string;
  ownerId: string;
  acceptanceCriteria: string;
  requiredEvidence: string;
  wbsNodeId: string;
}

const emptyForm: RequirementForm = {
  code: "",
  description: "",
  category: "OPERATION",
  priority: "MEDIUM",
  status: "DRAFT",
  source: "",
  sourceValidUntil: "",
  ownerId: "",
  acceptanceCriteria: "",
  requiredEvidence: "",
  wbsNodeId: "",
};

export function RequirementsView({
  projectId,
  requirements,
  wbsOptions,
  members,
  canCreate,
  canEdit,
  canDelete,
}: {
  projectId: string;
  requirements: RequirementRow[];
  wbsOptions: { id: string; code: string; name: string }[];
  members: { id: string; name: string }[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RequirementRow | null>(null);
  const [form, setForm] = useState<RequirementForm>(emptyForm);
  const [evidenceFor, setEvidenceFor] = useState<RequirementRow | null>(null);
  const [evidences, setEvidences] = useState<RequirementEvidenceRow[]>([]);
  const [evidenceLabel, setEvidenceLabel] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");

  const set = (key: keyof RequirementForm, value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = (row: RequirementRow) => {
    setEditing(row);
    setForm({
      code: row.code,
      description: row.description,
      category: row.category,
      priority: row.priority,
      status: row.status,
      source: row.source ?? "",
      sourceValidUntil: row.sourceValidUntil ? row.sourceValidUntil.toISOString().slice(0, 10) : "",
      ownerId: row.ownerId ?? "",
      acceptanceCriteria: row.acceptanceCriteria ?? "",
      requiredEvidence: row.requiredEvidence ?? "",
      wbsNodeId: row.wbsNodeId ?? "",
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
        description: form.description,
        category: form.category,
        priority: form.priority,
        status: form.status,
        source: form.source || null,
        sourceValidUntil: form.sourceValidUntil || null,
        ownerId: form.ownerId || null,
        acceptanceCriteria: form.acceptanceCriteria || null,
        requiredEvidence: form.requiredEvidence || null,
        wbsNodeId: form.wbsNodeId || null,
      };
      if (editing) {
        await apiRequest(`/api/v1/requirements/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest(`/api/v1/projects/${projectId}/requirements`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setDialogOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar requisito.");
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (row: RequirementRow, status: string) => {
    setError(null);
    try {
      await apiRequest(`/api/v1/requirements/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao mudar o status.");
    }
  };

  const remove = async (row: RequirementRow) => {
    if (!window.confirm(`Remover o requisito ${row.code}?`)) return;
    setError(null);
    try {
      await apiRequest(`/api/v1/requirements/${row.id}`, { method: "DELETE" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao remover.");
    }
  };

  const openEvidence = async (row: RequirementRow) => {
    setError(null);
    setEvidenceFor(row);
    setEvidenceLabel("");
    setEvidenceUrl("");
    try {
      const data = await apiRequest<{ requirement: { evidences: RequirementEvidenceRow[] } }>(
        `/api/v1/requirements/${row.id}`
      );
      setEvidences(data.requirement.evidences);
    } catch (caught) {
      setEvidences([]);
      setError(caught instanceof Error ? caught.message : "Falha ao carregar evidências.");
    }
  };

  const addEvidence = async () => {
    if (!evidenceFor || !evidenceLabel.trim()) return;
    setError(null);
    try {
      await apiRequest(`/api/v1/requirements/${evidenceFor.id}/evidence`, {
        method: "POST",
        body: JSON.stringify({ label: evidenceLabel, url: evidenceUrl || undefined }),
      });
      const data = await apiRequest<{ requirement: { evidences: RequirementEvidenceRow[] } }>(
        `/api/v1/requirements/${evidenceFor.id}`
      );
      setEvidences(data.requirement.evidences);
      setEvidenceLabel("");
      setEvidenceUrl("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao adicionar evidência.");
    }
  };

  const removeEvidence = async (evidenceId: string) => {
    if (!evidenceFor) return;
    setError(null);
    try {
      await apiRequest(`/api/v1/requirements/${evidenceFor.id}/evidence/${evidenceId}`, {
        method: "DELETE",
      });
      setEvidences((previous) => previous.filter((item) => item.id !== evidenceId));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao remover evidência.");
    }
  };

  const review = async (row: RequirementRow) => {
    setError(null);
    try {
      await apiRequest(`/api/v1/requirements/${row.id}/review`, { method: "POST", body: "{}" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao revisar.");
    }
  };

  const statusOptions = editing
    ? [editing.status, ...allowedRequirementTransitions(editing.status as RequirementStatusValue)]
    : (["DRAFT", "ACTIVE"] as const);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {requirements.length} requisito{requirements.length === 1 ? "" : "s"} · BR-008 exige
          critério de aceite e evidência para concluir; BR-015 exige fonte e vigência nos
          regulatórios.
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() =>
              window.open(`/api/v1/projects/${projectId}/drp?format=markdown`, "_blank")
            }
          >
            <ExternalLink className="h-4 w-4" />
            Abrir DRP
          </Button>
          {canCreate && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Novo requisito
            </Button>
          )}
        </div>
      </div>

      <ErrorBox message={error} />

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="px-4 py-2.5">Código</th>
              <th className="px-4 py-2.5">Descrição</th>
              <th className="px-4 py-2.5">Categoria</th>
              <th className="px-4 py-2.5">Prioridade</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Responsável</th>
              <th className="px-4 py-2.5">WBS</th>
              <th className="px-4 py-2.5">Evid.</th>
              <th className="px-4 py-2.5">Rev.</th>
              <th className="px-4 py-2.5 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {requirements.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0 align-top">
                <td className="px-4 py-2.5 font-mono text-xs">{row.code}</td>
                <td className="max-w-xs px-4 py-2.5">{row.description}</td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {REQUIREMENT_CATEGORY_LABELS[row.category as RequirementCategoryValue] ??
                    row.category}
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant={PRIORITY_VARIANT[row.priority] ?? "secondary"}>
                    {REQUIREMENT_PRIORITY_LABELS[row.priority as RequirementPriorityValue] ??
                      row.priority}
                  </Badge>
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant={STATUS_VARIANT[row.status] ?? "secondary"}>
                    {REQUIREMENT_STATUS_LABELS[row.status as RequirementStatusValue] ??
                      row.status}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{row.ownerName ?? "—"}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                  {row.wbsNodeCode ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{row.evidenceCount}</td>
                <td className="px-4 py-2.5 text-muted-foreground" title={`Revisão ${row.revision}`}>
                  {row.revision}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {canEdit &&
                      allowedRequirementTransitions(row.status as RequirementStatusValue).map(
                        (next) => (
                          <Button
                            key={next}
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            title={`Mudar para ${REQUIREMENT_STATUS_LABELS[next]}`}
                            onClick={() => void changeStatus(row, next)}
                          >
                            {REQUIREMENT_STATUS_LABELS[next]}
                          </Button>
                        )
                      )}
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Evidências"
                      onClick={() => void openEvidence(row)}
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                    </Button>
                    {canEdit && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Marcar revisão do DRP"
                          onClick={() => void review(row)}
                        >
                          <ClipboardCheck className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Editar requisito"
                          onClick={() => openEdit(row)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Remover requisito"
                        onClick={() => void remove(row)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {requirements.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum requisito cadastrado. O G1 exige ao menos um requisito com critério,
                  responsável e evidência.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={dialogOpen}
        title={editing ? `Editar ${editing.code}` : "Novo requisito"}
        onClose={() => setDialogOpen(false)}
        wide
      >
        <div className="flex flex-col gap-4">
          <ErrorBox message={error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="req-code">Código</Label>
              <Input
                id="req-code"
                value={form.code}
                onChange={(event) => set("code", event.target.value.toUpperCase())}
                placeholder="REQ-001 (vazio = automático)"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="req-status">Status</Label>
              <select
                id="req-status"
                value={form.status}
                onChange={(event) => set("status", event.target.value)}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {REQUIREMENT_STATUS_LABELS[status as RequirementStatusValue] ?? status}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="req-description">Descrição *</Label>
            <textarea
              id="req-description"
              rows={3}
              value={form.description}
              onChange={(event) => set("description", event.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="req-category">Categoria</Label>
              <select
                id="req-category"
                value={form.category}
                onChange={(event) => set("category", event.target.value)}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                {Object.entries(REQUIREMENT_CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="req-priority">Prioridade</Label>
              <select
                id="req-priority"
                value={form.priority}
                onChange={(event) => set("priority", event.target.value)}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                {Object.entries(REQUIREMENT_PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="req-owner">Responsável</Label>
              <select
                id="req-owner"
                value={form.ownerId}
                onChange={(event) => set("ownerId", event.target.value)}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                <option value="">Sem responsável</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="req-wbs">Nó de WBS</Label>
              <select
                id="req-wbs"
                value={form.wbsNodeId}
                onChange={(event) => set("wbsNodeId", event.target.value)}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                <option value="">Sem vínculo</option>
                {wbsOptions.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.code} — {node.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="req-source">Fonte (BR-015)</Label>
              <Input
                id="req-source"
                value={form.source}
                onChange={(event) => set("source", event.target.value)}
                placeholder="Norma, licença, autoridade"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="req-validity">Vigência (BR-015)</Label>
              <Input
                id="req-validity"
                type="date"
                value={form.sourceValidUntil}
                onChange={(event) => set("sourceValidUntil", event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="req-acceptance">Critério de aceite (BR-008)</Label>
            <textarea
              id="req-acceptance"
              rows={2}
              value={form.acceptanceCriteria}
              onChange={(event) => set("acceptanceCriteria", event.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="req-evidence">Evidência exigida</Label>
            <Input
              id="req-evidence"
              value={form.requiredEvidence}
              onChange={(event) => set("requiredEvidence", event.target.value)}
              placeholder="Laudo, ata, registro fotográfico…"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void submit()}
              disabled={busy || !form.description.trim()}
            >
              {busy ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(evidenceFor)}
        title={`Evidências — ${evidenceFor?.code ?? ""}`}
        onClose={() => setEvidenceFor(null)}
      >
        <div className="flex flex-col gap-4">
          <ErrorBox message={error} />
          <ul className="flex flex-col gap-2">
            {evidences.map((evidence) => (
              <li
                key={evidence.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span className="truncate">{evidence.label}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Remover evidência"
                  onClick={() => void removeEvidence(evidence.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
            {evidences.length === 0 && (
              <li className="text-sm text-muted-foreground">
                Nenhuma evidência vinculada (obrigatória para concluir — BR-008).
              </li>
            )}
          </ul>
          {canEdit && (
            <div className="grid gap-2">
              <Label htmlFor="evidence-label">Nova evidência *</Label>
              <Input
                id="evidence-label"
                value={evidenceLabel}
                onChange={(event) => setEvidenceLabel(event.target.value)}
                placeholder="Relatório de ensaio"
              />
              <Label htmlFor="evidence-url">Link (opcional)</Label>
              <Input
                id="evidence-url"
                value={evidenceUrl}
                onChange={(event) => setEvidenceUrl(event.target.value)}
                placeholder="https://…"
              />
              <div className="flex justify-end gap-2 pt-1">
                <Button onClick={() => void addEvidence()} disabled={!evidenceLabel.trim()}>
                  <Paperclip className="h-4 w-4" />
                  Vincular
                </Button>
              </div>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}
