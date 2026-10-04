"use client";

import { useState } from "react";
import { Plus, Trash2, CheckCircle2, Circle, ShieldCheck, FileCheck2 } from "lucide-react";
import type { GateInstanceRow } from "@/modules/gates/instances";
import { actionsForStatus, type GateAction } from "@/modules/gates/engine";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { GATE_STATUS_LABELS, GATE_ACTIONS_LABELS } from "./labels";

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

const DECISION_ACTIONS: GateAction[] = ["approve", "reject", "waive"];

export function GateDialog({
  gate: initial,
  canEdit,
  canApprove,
  canReject,
  onClose,
}: {
  gate: GateInstanceRow;
  canEdit: boolean;
  canApprove: boolean;
  canReject: boolean;
  onClose: () => void;
}) {
  const [gate, setGate] = useState<GateInstanceRow>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [promptAction, setPromptAction] = useState<GateAction | null>(null);
  const [reason, setReason] = useState("");
  const [evLabel, setEvLabel] = useState("");
  const [evUrl, setEvUrl] = useState("");

  const allowed = actionsForStatus(gate.status);
  const decided = gate.status === "APPROVED" || gate.status === "WAIVED";

  const canDo = (action: GateAction): boolean => {
    if (!allowed.includes(action)) return false;
    if (action === "approve" || action === "waive") return canApprove;
    if (action === "reject") return canReject;
    return canEdit;
  };

  const run = async (action: GateAction, actionReason?: string) => {
    setError(null);
    setBusy(true);
    try {
      const data = await apiRequest<{ gate: GateInstanceRow }>(`/api/v1/gates/${gate.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action, reason: actionReason || undefined }),
      });
      setGate(data.gate);
      setPromptAction(null);
      setReason("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha na ação.");
    } finally {
      setBusy(false);
    }
  };

  const toggleCriterion = async (code: string, completed: boolean) => {
    setError(null);
    setBusy(true);
    try {
      const data = await apiRequest<{ gate: GateInstanceRow }>(
        `/api/v1/gates/${gate.id}/criteria`,
        {
          method: "PUT",
          body: JSON.stringify({ results: [{ criterionCode: code, completed }] }),
        }
      );
      setGate(data.gate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao atualizar critério.");
    } finally {
      setBusy(false);
    }
  };

  const addEvidence = async () => {
    setError(null);
    setBusy(true);
    try {
      const data = await apiRequest<{ gate: GateInstanceRow }>(
        `/api/v1/gates/${gate.id}/evidences`,
        {
          method: "POST",
          body: JSON.stringify({ label: evLabel, url: evUrl || undefined }),
        }
      );
      setGate(data.gate);
      setEvLabel("");
      setEvUrl("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao registrar evidência.");
    } finally {
      setBusy(false);
    }
  };

  const removeEvidence = async (evidenceId: string) => {
    setError(null);
    setBusy(true);
    try {
      const data = await apiRequest<{ gate: GateInstanceRow }>(
        `/api/v1/gates/${gate.id}?evidenceId=${evidenceId}`,
        { method: "DELETE" }
      );
      setGate(data.gate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao remover evidência.");
    } finally {
      setBusy(false);
    }
  };

  const statusInfo = GATE_STATUS_LABELS[gate.status] ?? {
    label: gate.status,
    variant: "secondary" as const,
  };
  const doneCount = gate.criteria.filter(
    (criterion) => gate.results[criterion.code]?.completed
  ).length;

  const act = (action: GateAction) => {
    if (DECISION_ACTIONS.includes(action)) {
      setPromptAction(action);
      setReason("");
    } else {
      void run(action);
    }
  };

  return (
    <Dialog open title={`${gate.code} — ${gate.name}`} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          <Badge variant="outline">Fase {gate.phase}</Badge>
          {gate.required && <Badge variant="warning">Obrigatório (BR-001)</Badge>}
          {gate.requiresEvidence && (
            <Badge variant="secondary">
              <FileCheck2 className="mr-1 h-2.5 w-2.5" />
              Evidência exigida (BR-002)
            </Badge>
          )}
          <Badge variant="secondary">
            Aprovações: {gate.approvals.filter((a) => a.decision === "APPROVED").length}/
            {gate.minimumApprovals}
          </Badge>
        </div>

        {gate.description && (
          <p className="text-sm text-muted-foreground">{gate.description}</p>
        )}

        <ErrorBox message={error} />

        {/* Ações de estado */}
        <div className="flex flex-wrap gap-2">
          {(["start", "submit", "analyze", "approve", "reject", "waive"] as GateAction[]).map(
            (action) =>
              canDo(action) && (
                <Button
                  key={action}
                  size="sm"
                  variant={
                    action === "approve"
                      ? "default"
                      : action === "reject"
                        ? "destructive"
                        : action === "waive"
                          ? "secondary"
                          : "outline"
                  }
                  disabled={busy}
                  onClick={() => act(action)}
                >
                  {action === "approve" && <ShieldCheck className="h-3.5 w-3.5" />}
                  {GATE_ACTIONS_LABELS[action]}
                </Button>
              )
          )}
        </div>

        {/* Prompt de justificativa (rejeição/dispensa) */}
        {promptAction && (
          <div className="rounded-md border border-border bg-muted p-3">
            <Label htmlFor="gate-reason">
              {promptAction === "waive" ? "Justificativa da dispensa (obrigatória)" : "Motivo da rejeição (obrigatório)"}
            </Label>
            <textarea
              id="gate-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setPromptAction(null)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                variant={promptAction === "reject" ? "destructive" : "default"}
                disabled={busy || !reason.trim()}
                onClick={() => void run(promptAction, reason)}
              >
                Confirmar
              </Button>
            </div>
          </div>
        )}

        {/* Critérios */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Critérios{" "}
              <span className="font-normal text-muted-foreground">
                {doneCount}/{gate.criteria.length}
              </span>
            </h3>
            {gate.required && gate.status !== "APPROVED" && (
              <span className="text-xs text-muted-foreground">
                Todos os obrigatórios precisam estar completos para aprovar
              </span>
            )}
          </div>
          <ul className="flex flex-col gap-1.5 rounded-md border border-border p-3">
            {gate.criteria.map((criterion) => {
              const result = gate.results[criterion.code];
              const completed = result?.completed ?? false;
              const editable = canEdit && !decided && gate.status !== "NOT_STARTED";
              return (
                <li key={criterion.code}>
                  <label
                    className={`flex items-start gap-2 text-sm ${
                      editable ? "cursor-pointer" : "cursor-default"
                    }`}
                  >
                    <button
                      type="button"
                      disabled={!editable || busy}
                      onClick={() => void toggleCriterion(criterion.code, !completed)}
                      className="mt-0.5 shrink-0"
                      title={editable ? "Marcar critério" : "Somente leitura"}
                    >
                      {completed ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      ) : (
                        <Circle
                          className={`h-4 w-4 ${criterion.required ? "text-warning" : "text-muted-foreground"}`}
                        />
                      )}
                    </button>
                    <span className={completed ? "text-muted-foreground line-through" : ""}>
                      {criterion.description}
                      {criterion.required && <span className="ml-1 text-warning">*</span>}
                    </span>
                  </label>
                  {result?.note && (
                    <p className="ml-6 text-xs text-muted-foreground">{result.note}</p>
                  )}
                </li>
              );
            })}
            {gate.criteria.length === 0 && (
              <li className="text-sm text-muted-foreground">Sem critérios definidos.</li>
            )}
          </ul>
        </div>

        {/* Evidências */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Evidências{" "}
              <span className="font-normal text-muted-foreground">({gate.evidences.length})</span>
            </h3>
          </div>
          <ul className="flex flex-col gap-1.5 rounded-md border border-border p-3">
            {gate.evidences.map((evidence) => (
              <li key={evidence.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">
                  {evidence.url ? (
                    <a
                      href={evidence.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      {evidence.label}
                    </a>
                  ) : (
                    evidence.label
                  )}
                </span>
                {canEdit && !decided && (
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Remover evidência"
                    disabled={busy}
                    onClick={() => void removeEvidence(evidence.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
            {gate.evidences.length === 0 && (
              <li className="text-sm text-muted-foreground">
                Nenhuma evidência registrada
                {gate.requiresEvidence ? " — exigida para aprovação (BR-002)." : "."}
              </li>
            )}
          </ul>

          {canEdit && !decided && gate.status !== "NOT_STARTED" && (
            <div className="mt-2 flex items-end gap-2">
              <div className="grid flex-1 gap-1">
                <Label htmlFor="evidence-label">Nova evidência *</Label>
                <Input
                  id="evidence-label"
                  value={evLabel}
                  onChange={(event) => setEvLabel(event.target.value)}
                  placeholder="Ex.: ata da reunião, foto, PDF…"
                />
              </div>
              <div className="grid flex-1 gap-1">
                <Label htmlFor="evidence-url">Link (opcional)</Label>
                <Input
                  id="evidence-url"
                  value={evUrl}
                  onChange={(event) => setEvUrl(event.target.value)}
                  placeholder="https://…"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !evLabel.trim()}
                onClick={() => void addEvidence()}
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar
              </Button>
            </div>
          )}
        </div>

        {/* Histórico de aprovações */}
        {gate.approvals.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold">Decisões</h3>
            <ul className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm">
              {gate.approvals.map((approval) => (
                <li key={approval.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-muted-foreground">
                    <span
                      className={
                        approval.decision === "APPROVED" ? "text-success" : "text-destructive"
                      }
                    >
                      {approval.decision === "APPROVED" ? "Aprovou" : "Rejeitou"}
                    </span>
                    {approval.comment && ` — ${approval.comment}`}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(approval.createdAt).toLocaleString("pt-BR")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {gate.decision && gate.decisionReason && (
          <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
            <span className="font-medium">Decisão:</span> {gate.decision} — {gate.decisionReason}
          </p>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
