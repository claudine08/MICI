"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, ArrowRightLeft, ClipboardList } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import {
  CHANGE_ACTION_LABELS_PT,
  CHANGE_DIMENSIONS,
  CHANGE_DIMENSION_LABELS_PT,
  CHANGE_STATUS_LABELS_PT,
  CHANGE_TRANSITIONS,
  IMPACT_SEVERITIES,
  IMPACT_SEVERITY_LABELS_PT,
  availableChangeActions,
  type ChangeAction,
  type ChangeDimension,
  type ChangeStatus,
  type ImpactSeverity,
} from "@/modules/change/engine";

// Controle de mudanças do projeto (E11, §31): workflow DRAFT→…→CLOSED,
// análise de impacto por dimensão, aprovação auditada e vínculo de baselines
// na implementação (BR-005). Severidade consolidada é derivada no cliente
// pela MESMA regra do servidor.

interface MemberLite {
  userId: string;
  name: string;
}

interface OptionLite {
  id: string;
  label: string;
}

export interface ChangeRow {
  id: string;
  code: string;
  title: string;
  description: string | null;
  justification: string | null;
  category: ChangeDimension;
  status: ChangeStatus;
  isOpen: boolean;
  ownerId: string | null;
  ownerName: string | null;
  requestedById: string;
  requestedByName: string | null;
  dueDate: string | null;
  costDelta: number | null;
  scheduleDays: number | null;
  overallSeverity: ImpactSeverity;
  impactCount: number;
  implementationNotes: string | null;
  rejectReason: string | null;
  cancelReason: string | null;
  approvedAt: string | null;
  implementedAt: string | null;
  verifiedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  approvalCount: number;
  baselineCount: number;
  version: number;
}

interface ChangeImpactRow {
  id: string;
  dimension: ChangeDimension;
  severity: ImpactSeverity;
  notes: string | null;
  assessedById: string | null;
  assessedAt: string | null;
  updatedAt: string;
}

interface ChangeApprovalRow {
  id: string;
  action: "APPROVE" | "REJECT";
  comment: string | null;
  approverId: string;
  approverName: string | null;
  createdAt: string;
}

interface Props {
  projectId: string;
  initialChanges: ChangeRow[];
  members: MemberLite[];
  baselines: OptionLite[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canReject: boolean;
}

const SEVERITY_VARIANT: Record<ImpactSeverity, "secondary" | "default" | "warning" | "destructive"> = {
  NONE: "secondary",
  LOW: "secondary",
  MEDIUM: "default",
  HIGH: "warning",
  CRITICAL: "destructive",
};

function formatBrl(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`;
}

function formatDays(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value} d`;
}

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

interface ChangeForm {
  code: string;
  title: string;
  category: string;
  description: string;
  justification: string;
  ownerId: string;
  dueDate: string;
  costDelta: string;
  scheduleDays: string;
}

const emptyChangeForm: ChangeForm = {
  code: "",
  title: "",
  category: "SCOPE",
  description: "",
  justification: "",
  ownerId: "",
  dueDate: "",
  costDelta: "",
  scheduleDays: "",
};

export function ChangeView({
  projectId,
  initialChanges,
  members,
  baselines,
  canCreate,
  canEdit,
  canDelete,
  canApprove,
  canReject,
}: Props) {
  const router = useRouter();
  const base = `/api/v1/projects/${projectId}/changes`;
  const [changes, setChanges] = useState<ChangeRow[]>(initialChanges);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [changeDialog, setChangeDialog] = useState(false);
  const [editingChangeId, setEditingChangeId] = useState<string | null>(null);
  const [changeForm, setChangeForm] = useState<ChangeForm>(emptyChangeForm);

  const [transitionChange, setTransitionChange] = useState<ChangeRow | null>(null);
  const [transitionAction, setTransitionAction] = useState<ChangeAction | "">("");
  const [transitionReason, setTransitionReason] = useState("");
  const [transitionNotes, setTransitionNotes] = useState("");
  const [transitionBaselines, setTransitionBaselines] = useState<string[]>([]);

  const [detailChange, setDetailChange] = useState<ChangeRow | null>(null);
  const [detailImpacts, setDetailImpacts] = useState<ChangeImpactRow[]>([]);
  const [detailApprovals, setDetailApprovals] = useState<ChangeApprovalRow[]>([]);
  const [impactDraft, setImpactDraft] = useState<
    Record<ChangeDimension, { severity: ImpactSeverity; notes: string }>
  >(() =>
    Object.fromEntries(
      CHANGE_DIMENSIONS.map((dimension) => [dimension, { severity: "NONE" as ImpactSeverity, notes: "" }])
    ) as Record<ChangeDimension, { severity: ImpactSeverity; notes: string }>
  );

  const openCount = changes.filter((change) => change.isOpen).length;
  const waitingCount = changes.filter((change) => change.status === "WAITING_APPROVAL").length;
  const approvedCount = changes.filter((change) => change.status === "APPROVED").length;
  const highCount = changes.filter(
    (change) => change.overallSeverity === "HIGH" || change.overallSeverity === "CRITICAL"
  ).length;

  const load = async () => {
    try {
      const payload = await apiRequest<{ changes: ChangeRow[] }>(base);
      setChanges(payload.changes);
      setError(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao carregar mudanças.");
    }
  };

  const setForm = (key: keyof ChangeForm, value: string) =>
    setChangeForm((previous) => ({ ...previous, [key]: value }));

  const openCreate = () => {
    setEditingChangeId(null);
    setChangeForm(emptyChangeForm);
    setError(null);
    setChangeDialog(true);
  };

  const openEdit = (change: ChangeRow) => {
    setEditingChangeId(change.id);
    setChangeForm({
      code: change.code,
      title: change.title,
      category: change.category,
      description: change.description ?? "",
      justification: change.justification ?? "",
      ownerId: change.ownerId ?? "",
      dueDate: change.dueDate ?? "",
      costDelta: change.costDelta === null ? "" : String(change.costDelta),
      scheduleDays: change.scheduleDays === null ? "" : String(change.scheduleDays),
    });
    setError(null);
    setChangeDialog(true);
  };

  const submitChange = async () => {
    setError(null);
    setBusy(true);
    try {
      const payload = {
        code: changeForm.code || undefined,
        title: changeForm.title,
        category: changeForm.category,
        description: changeForm.description || undefined,
        justification: changeForm.justification || undefined,
        ownerId: changeForm.ownerId || null,
        dueDate: changeForm.dueDate || undefined,
        costDelta: changeForm.costDelta === "" ? undefined : Number(changeForm.costDelta),
        scheduleDays: changeForm.scheduleDays === "" ? undefined : Number(changeForm.scheduleDays),
      };
      if (editingChangeId) {
        await apiRequest(`${base}/${editingChangeId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest(base, { method: "POST", body: JSON.stringify(payload) });
      }
      setChangeDialog(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar mudança.");
    } finally {
      setBusy(false);
    }
  };

  const removeChange = async (change: ChangeRow) => {
    if (!window.confirm(`Excluir a mudança ${change.code}?`)) return;
    setError(null);
    try {
      await apiRequest(`${base}/${change.id}`, { method: "DELETE" });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao excluir mudança.");
    }
  };

  const openTransition = (change: ChangeRow) => {
    setTransitionChange(change);
    setTransitionAction("");
    setTransitionReason("");
    setTransitionNotes("");
    setTransitionBaselines([]);
    setError(null);
  };

  const submitTransition = async () => {
    if (!transitionChange || !transitionAction) return;
    setError(null);
    setBusy(true);
    try {
      await apiRequest(`${base}/${transitionChange.id}/status`, {
        method: "POST",
        body: JSON.stringify({
          action: transitionAction,
          reason: transitionReason || undefined,
          implementationNotes: transitionNotes || undefined,
          baselineIds: transitionBaselines.length > 0 ? transitionBaselines : undefined,
        }),
      });
      setTransitionChange(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha na transição.");
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (change: ChangeRow) => {
    setError(null);
    setDetailChange(change);
    const draft = Object.fromEntries(
      CHANGE_DIMENSIONS.map((dimension) => [dimension, { severity: "NONE" as ImpactSeverity, notes: "" }])
    ) as Record<ChangeDimension, { severity: ImpactSeverity; notes: string }>;
    try {
      const [detail, approvals] = await Promise.all([
        apiRequest<{ change: ChangeRow; impacts: ChangeImpactRow[] }>(`${base}/${change.id}`),
        apiRequest<{ approvals: ChangeApprovalRow[] }>(`${base}/${change.id}/approvals`),
      ]);
      for (const impact of detail.impacts) {
        draft[impact.dimension] = { severity: impact.severity, notes: impact.notes ?? "" };
      }
      setDetailImpacts(detail.impacts);
      setDetailApprovals(approvals.approvals);
      setImpactDraft(draft);
    } catch (caught) {
      setDetailImpacts([]);
      setDetailApprovals([]);
      setError(caught instanceof Error ? caught.message : "Falha ao carregar detalhes.");
    }
  };

  const submitImpacts = async () => {
    if (!detailChange) return;
    setError(null);
    setBusy(true);
    try {
      for (const dimension of CHANGE_DIMENSIONS) {
        const entry = impactDraft[dimension];
        if (entry.severity === "NONE" && !entry.notes.trim()) continue;
        await apiRequest(`${base}/${detailChange.id}/impacts`, {
          method: "POST",
          body: JSON.stringify({
            dimension,
            severity: entry.severity,
            notes: entry.notes.trim() || undefined,
          }),
        });
      }
      await openDetail(detailChange);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar impactos.");
    } finally {
      setBusy(false);
    }
  };

  const editableStatuses: ChangeStatus[] = ["DRAFT", "IMPACT_ANALYSIS"];

  return (
    <div className="flex flex-col gap-6">
      <ErrorBox message={error} />

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Controle de mudanças (§31)</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Mudanças", value: changes.length },
            { label: "Abertas", value: openCount },
            { label: "Aguardando aprovação", value: waitingCount },
            { label: "Aprovadas", value: approvedCount },
            { label: "Alto impacto", value: highCount },
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

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Mudanças do projeto</h2>
          {canCreate && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Nova mudança
            </Button>
          )}
        </div>
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-2.5">Código</th>
                <th className="px-4 py-2.5">Título</th>
                <th className="px-4 py-2.5">Categoria</th>
                <th className="px-4 py-2.5">Impacto</th>
                <th className="px-4 py-2.5">Custo Δ</th>
                <th className="px-4 py-2.5">Prazo Δ</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Responsável</th>
                <th className="px-4 py-2.5">Prazo</th>
                {(canEdit || canDelete) && <th className="px-4 py-2.5 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {changes.map((change) => (
                <tr key={change.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs">{change.code}</td>
                  <td className="px-4 py-2.5">{change.title}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {CHANGE_DIMENSION_LABELS_PT[change.category] ?? change.category}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={SEVERITY_VARIANT[change.overallSeverity]}>
                      {IMPACT_SEVERITY_LABELS_PT[change.overallSeverity]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{formatBrl(change.costDelta)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{formatDays(change.scheduleDays)}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={change.isOpen ? "outline" : "secondary"}>
                      {CHANGE_STATUS_LABELS_PT[change.status] ?? change.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{change.ownerName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{change.dueDate ?? "—"}</td>
                  {(canEdit || canDelete) && (
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Detalhes, impactos e aprovações"
                          onClick={() => void openDetail(change)}
                        >
                          <ClipboardList className="h-3.5 w-3.5" />
                        </Button>
                        {canEdit && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Transição de status"
                              onClick={() => openTransition(change)}
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            </Button>
                            {editableStatuses.includes(change.status) ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Editar mudança"
                                onClick={() => openEdit(change)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <span className="px-2 text-xs text-muted-foreground">fluxo</span>
                            )}
                          </>
                        )}
                        {canDelete &&
                          (change.status === "DRAFT" ||
                            change.status === "CANCELLED" ||
                            change.status === "REJECTED") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Excluir mudança"
                              onClick={() => void removeChange(change)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {changes.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhuma mudança registrada. Crie a primeira mudança do projeto.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog
        open={changeDialog}
        title={editingChangeId ? "Editar mudança" : "Nova mudança"}
        onClose={() => setChangeDialog(false)}
        wide
      >
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="change-code">Código</Label>
              <Input
                id="change-code"
                value={changeForm.code}
                onChange={(event) => setForm("code", event.target.value)}
                placeholder="auto (CR001…)"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="change-title">Título *</Label>
              <Input
                id="change-title"
                value={changeForm.title}
                onChange={(event) => setForm("title", event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="change-category">Categoria *</Label>
              <select
                id="change-category"
                value={changeForm.category}
                onChange={(event) => setForm("category", event.target.value)}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                {CHANGE_DIMENSIONS.map((dimension) => (
                  <option key={dimension} value={dimension}>
                    {CHANGE_DIMENSION_LABELS_PT[dimension]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="change-owner">Responsável</Label>
              <select
                id="change-owner"
                value={changeForm.ownerId}
                onChange={(event) => setForm("ownerId", event.target.value)}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                <option value="">— selecionar —</option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="change-due">Prazo</Label>
              <Input
                id="change-due"
                type="date"
                value={changeForm.dueDate}
                onChange={(event) => setForm("dueDate", event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="change-description">Descrição</Label>
            <textarea
              id="change-description"
              value={changeForm.description}
              onChange={(event) => setForm("description", event.target.value)}
              rows={3}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="change-justification">Justificativa</Label>
            <textarea
              id="change-justification"
              value={changeForm.justification}
              onChange={(event) => setForm("justification", event.target.value)}
              rows={2}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="change-cost">Impacto de custo (R$, + = acréscimo)</Label>
              <Input
                id="change-cost"
                type="number"
                step="0.01"
                value={changeForm.costDelta}
                onChange={(event) => setForm("costDelta", event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="change-days">Impacto de prazo (dias, + = atraso)</Label>
              <Input
                id="change-days"
                type="number"
                value={changeForm.scheduleDays}
                onChange={(event) => setForm("scheduleDays", event.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setChangeDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void submitChange()}
              disabled={busy || !changeForm.title}
            >
              {busy ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={transitionChange !== null}
        title={
          transitionChange
            ? `Transição — ${transitionChange.code} (${CHANGE_STATUS_LABELS_PT[transitionChange.status]})`
            : "Transição"
        }
        onClose={() => setTransitionChange(null)}
        wide
      >
        {transitionChange && (
          <div className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="transition-action">Ação *</Label>
              <select
                id="transition-action"
                value={transitionAction}
                onChange={(event) => setTransitionAction(event.target.value as ChangeAction | "")}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                <option value="">— selecionar —</option>
                {availableChangeActions(transitionChange.status)
                  .filter((action) => {
                    if (action === "APPROVE") return canApprove;
                    if (action === "REJECT") return canReject;
                    return canEdit;
                  })
                  .map((action) => (
                    <option key={action} value={action}>
                      {CHANGE_ACTION_LABELS_PT[action]} →{" "}
                      {CHANGE_TRANSITIONS[transitionChange.status][action]}
                    </option>
                  ))}
              </select>
            </div>

            {(transitionAction === "CANCEL" || transitionAction === "REJECT") && (
              <div className="grid gap-2">
                <Label htmlFor="transition-reason">Motivo *</Label>
                <textarea
                  id="transition-reason"
                  value={transitionReason}
                  onChange={(event) => setTransitionReason(event.target.value)}
                  rows={2}
                  className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
                />
              </div>
            )}

            {transitionAction === "VERIFY" && (
              <div className="grid gap-2">
                <Label htmlFor="transition-reason">Nota de verificação *</Label>
                <textarea
                  id="transition-reason"
                  value={transitionReason}
                  onChange={(event) => setTransitionReason(event.target.value)}
                  rows={2}
                  className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
                />
              </div>
            )}

            {transitionAction === "APPROVE" && (
              <div className="grid gap-2">
                <Label htmlFor="transition-reason">Comentário da aprovação (opcional)</Label>
                <textarea
                  id="transition-reason"
                  value={transitionReason}
                  onChange={(event) => setTransitionReason(event.target.value)}
                  rows={2}
                  className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
                />
              </div>
            )}

            {transitionAction === "IMPLEMENT" && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="transition-notes">Notas de implementação *</Label>
                  <textarea
                    id="transition-notes"
                    value={transitionNotes}
                    onChange={(event) => setTransitionNotes(event.target.value)}
                    rows={3}
                    className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="transition-baselines">
                    Baselines vinculadas (baseline revision, BR-005)
                  </Label>
                  <select
                    id="transition-baselines"
                    multiple
                    value={transitionBaselines}
                    onChange={(event) =>
                      setTransitionBaselines(
                        Array.from(event.target.selectedOptions).map((option) => option.value)
                      )
                    }
                    className="h-28 rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  >
                    {baselines.map((baseline) => (
                      <option key={baseline.id} value={baseline.id}>
                        {baseline.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Baselines do projeto selecionadas aqui ficam vinculadas à mudança para
                    rastreabilidade.
                  </p>
                </div>
              </>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setTransitionChange(null)}>
                Cancelar
              </Button>
              <Button
                onClick={() => void submitTransition()}
                disabled={busy || !transitionAction}
              >
                {busy ? "Aplicando…" : "Aplicar"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={detailChange !== null}
        title={detailChange ? `Mudança ${detailChange.code} — impactos e aprovações` : "Mudança"}
        onClose={() => setDetailChange(null)}
        wide
      >
        {detailChange && (
          <div className="flex flex-col gap-4">
            <div className="rounded-md border border-border bg-surface p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{detailChange.title}</span>
                <Badge variant={detailChange.isOpen ? "outline" : "secondary"}>
                  {CHANGE_STATUS_LABELS_PT[detailChange.status]}
                </Badge>
              </div>
              {detailChange.description && <p className="mt-2">{detailChange.description}</p>}
              <div className="mt-2 grid gap-1 text-muted-foreground">
                <div>
                  <span className="text-foreground">Justificativa:</span>{" "}
                  {detailChange.justification ?? "—"}
                </div>
                <div>
                  <span className="text-foreground">Impacto consolidado:</span>{" "}
                  {formatBrl(detailChange.costDelta)} · {formatDays(detailChange.scheduleDays)} ·{" "}
                  severidade {IMPACT_SEVERITY_LABELS_PT[detailChange.overallSeverity]}
                </div>
                {detailChange.implementationNotes && (
                  <div>
                    <span className="text-foreground">Implementação:</span>{" "}
                    {detailChange.implementationNotes}
                  </div>
                )}
                {detailChange.rejectReason && (
                  <div>
                    <span className="text-foreground">Motivo da rejeição:</span>{" "}
                    {detailChange.rejectReason}
                  </div>
                )}
                {detailChange.cancelReason && (
                  <div>
                    <span className="text-foreground">Motivo do cancelamento:</span>{" "}
                    {detailChange.cancelReason}
                  </div>
                )}
                <div>
                  <span className="text-foreground">Solicitante:</span>{" "}
                  {detailChange.requestedByName ?? "—"} ·{" "}
                  <span className="text-foreground">Aprovações:</span>{" "}
                  {detailChange.approvalCount} ·{" "}
                  <span className="text-foreground">Baselines vinculadas:</span>{" "}
                  {detailChange.baselineCount}
                </div>
              </div>
            </div>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Análise de impacto (11 dimensões, §31)</h3>
              <p className="text-xs text-muted-foreground">
                Avalie cada dimensão aplicável. Envio para aprovação exige ao menos uma dimensão
                avaliada.
              </p>
              <div className="max-h-80 overflow-y-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <tbody>
                    {CHANGE_DIMENSIONS.map((dimension) => (
                      <tr key={dimension} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">
                          {CHANGE_DIMENSION_LABELS_PT[dimension]}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={impactDraft[dimension].severity}
                            onChange={(event) =>
                              setImpactDraft((previous) => ({
                                ...previous,
                                [dimension]: {
                                  ...previous[dimension],
                                  severity: event.target.value as ImpactSeverity,
                                },
                              }))
                            }
                            className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
                          >
                            {IMPACT_SEVERITIES.map((severity) => (
                              <option key={severity} value={severity}>
                                {IMPACT_SEVERITY_LABELS_PT[severity]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={impactDraft[dimension].notes}
                            onChange={(event) =>
                              setImpactDraft((previous) => ({
                                ...previous,
                                [dimension]: {
                                  ...previous[dimension],
                                  notes: event.target.value,
                                },
                              }))
                            }
                            placeholder="Notas"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {canEdit && editableStatuses.includes(detailChange.status) && (
                <div className="flex justify-end">
                  <Button onClick={() => void submitImpacts()} disabled={busy}>
                    {busy ? "Salvando…" : "Salvar impactos"}
                  </Button>
                </div>
              )}
              {detailImpacts.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhuma dimensão avaliada ainda.</p>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Histórico de aprovações</h3>
              {detailApprovals.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma decisão registrada.</p>
              )}
              {detailApprovals.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-md border border-border bg-surface p-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <Badge variant={entry.action === "APPROVE" ? "default" : "destructive"}>
                      {entry.action === "APPROVE" ? "Aprovada" : "Rejeitada"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {entry.approverName ?? entry.approverId} ·{" "}
                      {entry.createdAt.slice(0, 10)}
                    </span>
                  </div>
                  {entry.comment && <p className="mt-1 text-muted-foreground">{entry.comment}</p>}
                </div>
              ))}
            </section>
          </div>
        )}
      </Dialog>
    </div>
  );
}
