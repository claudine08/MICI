"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, History, ArrowRightLeft } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import {
  RISK_CATEGORIES,
  RISK_CATEGORY_LABELS_PT,
  RISK_RESPONSE_LABELS_PT,
  RISK_RESPONSE_STRATEGIES,
  RISK_STATUS_LABELS_PT,
  RISK_TRANSITIONS,
  availableRiskActions,
  riskExposure,
  riskLevel,
  type RiskAction,
  type RiskLevel,
  type RiskStatus,
} from "@/modules/risk/engine";

// Registro de riscos do projeto (E10, §32): probabilidade × impacto com
// matriz configurável, ciclo Identify→…→Close, respostas versionadas e
// risco residual. Nível é derivado no cliente pela MESMA matriz do servidor.

interface MemberLite {
  userId: string;
  name: string;
}

interface OptionLite {
  id: string;
  label: string;
}

export interface RiskMatrixView {
  probabilityLabels: string[];
  impactLabels: string[];
  lowMax: number;
  mediumMax: number;
  highMax: number;
  isCustom: boolean;
}

export interface RiskRow {
  id: string;
  code: string;
  title: string;
  cause: string | null;
  event: string | null;
  effect: string | null;
  category: string;
  probability: number;
  impact: number;
  exposure: number;
  level: RiskLevel;
  ownerId: string | null;
  ownerName: string | null;
  response: string | null;
  action: string | null;
  dueDate: string | null;
  status: RiskStatus;
  isOpen: boolean;
  residualProbability: number | null;
  residualImpact: number | null;
  residualExposure: number | null;
  residualLevel: RiskLevel | null;
  residualNotes: string | null;
  wbsNodeId: string | null;
  wbsNodeCode: string | null;
  activityId: string | null;
  activityCode: string | null;
  costItemId: string | null;
  costItemCode: string | null;
  analyzedAt: string | null;
  closedAt: string | null;
  responseCount: number;
  version: number;
}

interface RiskResponseRow {
  id: string;
  strategy: string;
  action: string | null;
  ownerId: string | null;
  ownerName: string | null;
  dueDate: string | null;
  notes: string | null;
  createdAt: string;
}

interface Props {
  projectId: string;
  initialRisks: RiskRow[];
  matrix: RiskMatrixView;
  members: MemberLite[];
  wbsNodes: OptionLite[];
  activities: OptionLite[];
  costItems: OptionLite[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

const LEVEL_VARIANT: Record<RiskLevel, "secondary" | "default" | "warning" | "destructive"> = {
  LOW: "secondary",
  MEDIUM: "default",
  HIGH: "warning",
  CRITICAL: "destructive",
};

const ACTION_LABELS_PT: Record<RiskAction, string> = {
  ANALYZE: "Analisar",
  PLAN: "Planejar resposta",
  IMPLEMENT: "Iniciar tratamento",
  MONITOR: "Monitorar",
  TREAT: "Retratamento",
  CLOSE: "Encerrar",
  CANCEL: "Cancelar",
  REOPEN: "Reabrir",
};

function levelOf(exposure: number, matrix: RiskMatrixView): RiskLevel {
  return riskLevel(exposure, matrix);
}

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

interface RiskForm {
  code: string;
  title: string;
  category: string;
  probability: string;
  impact: string;
  cause: string;
  event: string;
  effect: string;
  ownerId: string;
  response: string;
  action: string;
  dueDate: string;
  wbsNodeId: string;
  activityId: string;
  costItemId: string;
}

const emptyRiskForm: RiskForm = {
  code: "",
  title: "",
  category: "SCOPE",
  probability: "2",
  impact: "2",
  cause: "",
  event: "",
  effect: "",
  ownerId: "",
  response: "",
  action: "",
  dueDate: "",
  wbsNodeId: "",
  activityId: "",
  costItemId: "",
};

export function RiskView({
  projectId,
  initialRisks,
  matrix,
  members,
  wbsNodes,
  activities,
  costItems,
  canCreate,
  canEdit,
  canDelete,
}: Props) {
  const router = useRouter();
  const base = `/api/v1/projects/${projectId}/risks`;
  const [risks, setRisks] = useState<RiskRow[]>(initialRisks);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [riskDialog, setRiskDialog] = useState(false);
  const [editingRiskId, setEditingRiskId] = useState<string | null>(null);
  const [riskForm, setRiskForm] = useState<RiskForm>(emptyRiskForm);

  const [transitionRisk, setTransitionRisk] = useState<RiskRow | null>(null);
  const [transitionAction, setTransitionAction] = useState<RiskAction | "">("");
  const [transitionReason, setTransitionReason] = useState("");
  const [transitionResponse, setTransitionResponse] = useState("");
  const [transitionTreatment, setTransitionTreatment] = useState("");
  const [transitionOwnerId, setTransitionOwnerId] = useState("");
  const [transitionDueDate, setTransitionDueDate] = useState("");
  const [residualProbability, setResidualProbability] = useState("");
  const [residualImpact, setResidualImpact] = useState("");
  const [residualNotes, setResidualNotes] = useState("");

  const [historyRisk, setHistoryRisk] = useState<RiskRow | null>(null);
  const [history, setHistory] = useState<RiskResponseRow[]>([]);
  const [responseStrategy, setResponseStrategy] = useState("");
  const [responseAction, setResponseAction] = useState("");
  const [responseOwnerId, setResponseOwnerId] = useState("");
  const [responseNotes, setResponseNotes] = useState("");

  const openCount = risks.filter((risk) => risk.isOpen).length;
  const criticalCount = risks.filter((risk) => risk.isOpen && risk.level === "CRITICAL").length;
  const highCount = risks.filter((risk) => risk.isOpen && risk.level === "HIGH").length;
  const today = new Date().toISOString().slice(0, 10);
  const overdueCount = risks.filter(
    (risk) => risk.isOpen && risk.dueDate !== null && risk.dueDate < today
  ).length;

  const load = async () => {
    try {
      const payload = await apiRequest<{ risks: RiskRow[] }>(base);
      setRisks(payload.risks);
      setError(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao carregar riscos.");
    }
  };

  const setForm = (key: keyof RiskForm, value: string) =>
    setRiskForm((previous) => ({ ...previous, [key]: value }));

  const openCreate = () => {
    setEditingRiskId(null);
    setRiskForm(emptyRiskForm);
    setError(null);
    setRiskDialog(true);
  };

  const openEdit = (risk: RiskRow) => {
    setEditingRiskId(risk.id);
    setRiskForm({
      code: risk.code,
      title: risk.title,
      category: risk.category,
      probability: String(risk.probability),
      impact: String(risk.impact),
      cause: risk.cause ?? "",
      event: risk.event ?? "",
      effect: risk.effect ?? "",
      ownerId: risk.ownerId ?? "",
      response: risk.response ?? "",
      action: risk.action ?? "",
      dueDate: risk.dueDate ?? "",
      wbsNodeId: risk.wbsNodeId ?? "",
      activityId: risk.activityId ?? "",
      costItemId: risk.costItemId ?? "",
    });
    setError(null);
    setRiskDialog(true);
  };

  const submitRisk = async () => {
    setError(null);
    setBusy(true);
    try {
      const payload = {
        code: riskForm.code || undefined,
        title: riskForm.title,
        category: riskForm.category,
        probability: Number(riskForm.probability),
        impact: Number(riskForm.impact),
        cause: riskForm.cause || undefined,
        event: riskForm.event || undefined,
        effect: riskForm.effect || undefined,
        ownerId: riskForm.ownerId || null,
        response: riskForm.response || null,
        action: riskForm.action || undefined,
        dueDate: riskForm.dueDate || undefined,
        wbsNodeId: riskForm.wbsNodeId || null,
        activityId: riskForm.activityId || null,
        costItemId: riskForm.costItemId || null,
      };
      if (editingRiskId) {
        await apiRequest(`${base}/${editingRiskId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest(base, { method: "POST", body: JSON.stringify(payload) });
      }
      setRiskDialog(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar risco.");
    } finally {
      setBusy(false);
    }
  };

  const removeRisk = async (risk: RiskRow) => {
    if (!window.confirm(`Excluir o risco ${risk.code}?`)) return;
    setError(null);
    try {
      await apiRequest(`${base}/${risk.id}`, { method: "DELETE" });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao excluir risco.");
    }
  };

  const openTransition = (risk: RiskRow) => {
    setTransitionRisk(risk);
    setTransitionAction("");
    setTransitionReason("");
    setTransitionResponse(risk.response ?? "");
    setTransitionTreatment(risk.action ?? "");
    setTransitionOwnerId(risk.ownerId ?? "");
    setTransitionDueDate(risk.dueDate ?? "");
    setResidualProbability("");
    setResidualImpact("");
    setResidualNotes("");
    setError(null);
  };

  const submitTransition = async () => {
    if (!transitionRisk || !transitionAction) return;
    setError(null);
    setBusy(true);
    try {
      await apiRequest(`${base}/${transitionRisk.id}/status`, {
        method: "POST",
        body: JSON.stringify({
          action: transitionAction,
          reason: transitionReason || undefined,
          response: transitionResponse || undefined,
          treatment: transitionTreatment || undefined,
          ownerId: transitionOwnerId || undefined,
          dueDate: transitionDueDate || undefined,
          residualProbability:
            residualProbability === "" ? undefined : Number(residualProbability),
          residualImpact: residualImpact === "" ? undefined : Number(residualImpact),
          residualNotes: residualNotes || undefined,
        }),
      });
      setTransitionRisk(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha na transição.");
    } finally {
      setBusy(false);
    }
  };

  const openHistory = async (risk: RiskRow) => {
    setError(null);
    setHistoryRisk(risk);
    setResponseStrategy(risk.response ?? "MITIGATE");
    setResponseAction(risk.action ?? "");
    setResponseOwnerId(risk.ownerId ?? "");
    setResponseNotes("");
    try {
      const payload = await apiRequest<{ responses: RiskResponseRow[] }>(
        `${base}/${risk.id}/responses`
      );
      setHistory(payload.responses);
    } catch (caught) {
      setHistory([]);
      setError(caught instanceof Error ? caught.message : "Falha ao carregar histórico.");
    }
  };

  const submitResponse = async () => {
    if (!historyRisk || !responseStrategy) return;
    setError(null);
    setBusy(true);
    try {
      await apiRequest(`${base}/${historyRisk.id}/responses`, {
        method: "POST",
        body: JSON.stringify({
          strategy: responseStrategy,
          action: responseAction || undefined,
          ownerId: responseOwnerId || null,
          notes: responseNotes || undefined,
        }),
      });
      const payload = await apiRequest<{ responses: RiskResponseRow[] }>(
        `${base}/${historyRisk.id}/responses`
      );
      setHistory(payload.responses);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao registrar resposta.");
    } finally {
      setBusy(false);
    }
  };

  const previewExposure = riskExposure(Number(riskForm.probability), Number(riskForm.impact));
  const previewLevel = levelOf(previewExposure, matrix);

  return (
    <div className="flex flex-col gap-6">
      <ErrorBox message={error} />

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Matriz de risco (5×5)</h2>
          <span className="text-xs text-muted-foreground">
            {matrix.isCustom ? "Configurada pela organização" : "Padrão"} — níveis: ≤
            {matrix.lowMax} Baixo · ≤{matrix.mediumMax} Médio · ≤{matrix.highMax} Alto ·
            &gt;{matrix.highMax} Crítico
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Riscos", value: risks.length },
            { label: "Abertos", value: openCount },
            { label: "Críticos", value: criticalCount },
            { label: "Altos", value: highCount },
            { label: "Atrasados", value: overdueCount },
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
          <h2 className="text-sm font-semibold">Registro de riscos</h2>
          {canCreate && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Novo risco
            </Button>
          )}
        </div>
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-2.5">Código</th>
                <th className="px-4 py-2.5">Risco</th>
                <th className="px-4 py-2.5">Categoria</th>
                <th className="px-4 py-2.5 text-center">P × I</th>
                <th className="px-4 py-2.5">Nível</th>
                <th className="px-4 py-2.5">Responsável</th>
                <th className="px-4 py-2.5">Resposta</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Prazo</th>
                {(canEdit || canDelete) && <th className="px-4 py-2.5 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {risks.map((risk) => (
                <tr key={risk.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs">{risk.code}</td>
                  <td className="px-4 py-2.5">{risk.title}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {RISK_CATEGORY_LABELS_PT[risk.category as keyof typeof RISK_CATEGORY_LABELS_PT] ??
                      risk.category}
                  </td>
                  <td className="px-4 py-2.5 text-center font-medium">
                    {risk.probability} × {risk.impact}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={LEVEL_VARIANT[risk.level]}>{risk.level}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{risk.ownerName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {risk.response
                      ? (RISK_RESPONSE_LABELS_PT[
                          risk.response as keyof typeof RISK_RESPONSE_LABELS_PT
                        ] ?? risk.response)
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={risk.isOpen ? "outline" : "secondary"}>
                      {RISK_STATUS_LABELS_PT[risk.status] ?? risk.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{risk.dueDate ?? "—"}</td>
                  {(canEdit || canDelete) && (
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        {canEdit && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Transição de status"
                              onClick={() => openTransition(risk)}
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Histórico de respostas"
                              onClick={() => void openHistory(risk)}
                            >
                              <History className="h-3.5 w-3.5" />
                            </Button>
                            {!risk.isOpen ? (
                              <span className="px-2 text-xs text-muted-foreground">histórico</span>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Editar risco"
                                onClick={() => openEdit(risk)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </>
                        )}
                        {canDelete && risk.status !== "CLOSED" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Excluir risco"
                            onClick={() => void removeRisk(risk)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {risks.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhum risco registrado. Crie o primeiro risco do projeto.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog
        open={riskDialog}
        title={editingRiskId ? "Editar risco" : "Novo risco"}
        onClose={() => setRiskDialog(false)}
        wide
      >
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="risk-code">Código</Label>
              <Input
                id="risk-code"
                value={riskForm.code}
                onChange={(event) => setForm("code", event.target.value)}
                placeholder="auto (RI001…)"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="risk-title">Título *</Label>
              <Input
                id="risk-title"
                value={riskForm.title}
                onChange={(event) => setForm("title", event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="risk-category">Categoria *</Label>
              <select
                id="risk-category"
                value={riskForm.category}
                onChange={(event) => setForm("category", event.target.value)}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                {RISK_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {RISK_CATEGORY_LABELS_PT[category]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="risk-probability">Probabilidade (1–5) *</Label>
              <select
                id="risk-probability"
                value={riskForm.probability}
                onChange={(event) => setForm("probability", event.target.value)}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                {matrix.probabilityLabels.map((label, index) => (
                  <option key={label} value={index + 1}>
                    {index + 1} — {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="risk-impact">Impacto (1–5) *</Label>
              <select
                id="risk-impact"
                value={riskForm.impact}
                onChange={(event) => setForm("impact", event.target.value)}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                {matrix.impactLabels.map((label, index) => (
                  <option key={label} value={index + 1}>
                    {index + 1} — {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Exposição prevista: {previewExposure} ({previewLevel})
          </p>
          <div className="grid gap-2">
            <Label htmlFor="risk-cause">Causa</Label>
            <textarea
              id="risk-cause"
              value={riskForm.cause}
              onChange={(event) => setForm("cause", event.target.value)}
              rows={2}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="risk-event">Evento</Label>
            <textarea
              id="risk-event"
              value={riskForm.event}
              onChange={(event) => setForm("event", event.target.value)}
              rows={2}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="risk-effect">Efeito</Label>
            <textarea
              id="risk-effect"
              value={riskForm.effect}
              onChange={(event) => setForm("effect", event.target.value)}
              rows={2}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="risk-owner">Responsável</Label>
              <select
                id="risk-owner"
                value={riskForm.ownerId}
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
              <Label htmlFor="risk-due">Prazo</Label>
              <Input
                id="risk-due"
                type="date"
                value={riskForm.dueDate}
                onChange={(event) => setForm("dueDate", event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="risk-response">Estratégia de resposta</Label>
              <select
                id="risk-response"
                value={riskForm.response}
                onChange={(event) => setForm("response", event.target.value)}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                <option value="">— nenhuma —</option>
                {RISK_RESPONSE_STRATEGIES.map((strategy) => (
                  <option key={strategy} value={strategy}>
                    {RISK_RESPONSE_LABELS_PT[strategy]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="risk-action">Ação de tratamento</Label>
              <Input
                id="risk-action"
                value={riskForm.action}
                onChange={(event) => setForm("action", event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="risk-wbs">WBS</Label>
              <select
                id="risk-wbs"
                value={riskForm.wbsNodeId}
                onChange={(event) => setForm("wbsNodeId", event.target.value)}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                <option value="">— sem vínculo —</option>
                {wbsNodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="risk-activity">Atividade</Label>
              <select
                id="risk-activity"
                value={riskForm.activityId}
                onChange={(event) => setForm("activityId", event.target.value)}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                <option value="">— sem vínculo —</option>
                {activities.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="risk-cost">Item de custo</Label>
              <select
                id="risk-cost"
                value={riskForm.costItemId}
                onChange={(event) => setForm("costItemId", event.target.value)}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                <option value="">— sem vínculo —</option>
                {costItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRiskDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void submitRisk()}
              disabled={busy || !riskForm.title}
            >
              {busy ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={transitionRisk !== null}
        title={
          transitionRisk
            ? `Transição — ${transitionRisk.code} (${RISK_STATUS_LABELS_PT[transitionRisk.status]})`
            : "Transição"
        }
        onClose={() => setTransitionRisk(null)}
        wide
      >
        {transitionRisk && (
          <div className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="transition-action">Ação *</Label>
              <select
                id="transition-action"
                value={transitionAction}
                onChange={(event) => setTransitionAction(event.target.value as RiskAction | "")}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                <option value="">— selecionar —</option>
                {availableRiskActions(transitionRisk.status).map((action) => (
                  <option key={action} value={action}>
                    {ACTION_LABELS_PT[action]} → {RISK_TRANSITIONS[transitionRisk.status][action]}
                  </option>
                ))}
              </select>
            </div>

            {(transitionAction === "PLAN" || transitionAction === "TREAT") && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="transition-response">Estratégia *</Label>
                    <select
                      id="transition-response"
                      value={transitionResponse}
                      onChange={(event) => setTransitionResponse(event.target.value)}
                      disabled={transitionAction === "TREAT"}
                      className="rounded-md border border-border bg-surface px-3 py-2 text-sm disabled:opacity-60"
                    >
                      <option value="">— selecionar —</option>
                      {RISK_RESPONSE_STRATEGIES.map((strategy) => (
                        <option key={strategy} value={strategy}>
                          {RISK_RESPONSE_LABELS_PT[strategy]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="transition-owner">Responsável *</Label>
                    <select
                      id="transition-owner"
                      value={transitionOwnerId}
                      onChange={(event) => setTransitionOwnerId(event.target.value)}
                      disabled={transitionAction === "TREAT"}
                      className="rounded-md border border-border bg-surface px-3 py-2 text-sm disabled:opacity-60"
                    >
                      <option value="">— selecionar —</option>
                      {members.map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="transition-treatment">Ação de tratamento *</Label>
                  <textarea
                    id="transition-treatment"
                    value={transitionTreatment}
                    onChange={(event) => setTransitionTreatment(event.target.value)}
                    rows={2}
                    disabled={transitionAction === "TREAT"}
                    className="rounded-md border border-border bg-surface px-3 py-2 text-sm disabled:opacity-60"
                  />
                </div>
              </>
            )}

            {transitionAction === "CLOSE" && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="residual-probability">Probabilidade residual (1–5) *</Label>
                    <select
                      id="residual-probability"
                      value={residualProbability}
                      onChange={(event) => setResidualProbability(event.target.value)}
                      className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
                    >
                      <option value="">— selecionar —</option>
                      {matrix.probabilityLabels.map((label, index) => (
                        <option key={label} value={index + 1}>
                          {index + 1} — {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="residual-impact">Impacto residual (1–5) *</Label>
                    <select
                      id="residual-impact"
                      value={residualImpact}
                      onChange={(event) => setResidualImpact(event.target.value)}
                      className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
                    >
                      <option value="">— selecionar —</option>
                      {matrix.impactLabels.map((label, index) => (
                        <option key={label} value={index + 1}>
                          {index + 1} — {label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="residual-notes">Notas do residual</Label>
                  <textarea
                    id="residual-notes"
                    value={residualNotes}
                    onChange={(event) => setResidualNotes(event.target.value)}
                    rows={2}
                    className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  />
                </div>
              </>
            )}

            {(transitionAction === "CANCEL" || transitionAction === "TREAT") && (
              <div className="grid gap-2">
                <Label htmlFor="transition-reason">
                  {transitionAction === "CANCEL" ? "Motivo *" : "Nota *"}
                </Label>
                <textarea
                  id="transition-reason"
                  value={transitionReason}
                  onChange={(event) => setTransitionReason(event.target.value)}
                  rows={2}
                  className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setTransitionRisk(null)}>
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
        open={historyRisk !== null}
        title={historyRisk ? `Risco ${historyRisk.code} — detalhes e respostas` : "Risco"}
        onClose={() => setHistoryRisk(null)}
        wide
      >
        {historyRisk && (
          <div className="flex flex-col gap-4">
            <div className="rounded-md border border-border bg-surface p-3 text-sm">
              <div className="font-medium">{historyRisk.title}</div>
              <div className="mt-2 grid gap-1 text-muted-foreground">
                <div>
                  <span className="text-foreground">Causa:</span> {historyRisk.cause ?? "—"}
                </div>
                <div>
                  <span className="text-foreground">Evento:</span> {historyRisk.event ?? "—"}
                </div>
                <div>
                  <span className="text-foreground">Efeito:</span> {historyRisk.effect ?? "—"}
                </div>
                <div>
                  <span className="text-foreground">Exposição:</span> {historyRisk.exposure} (
                  {historyRisk.level})
                  {historyRisk.residualExposure !== null && (
                    <>
                      {" "}
                      · <span className="text-foreground">Residual:</span>{" "}
                      {historyRisk.residualExposure} ({historyRisk.residualLevel})
                    </>
                  )}
                </div>
              </div>
            </div>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Histórico de respostas</h3>
              {history.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma resposta registrada.</p>
              )}
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-md border border-border bg-surface p-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">
                      {RISK_RESPONSE_LABELS_PT[entry.strategy as keyof typeof RISK_RESPONSE_LABELS_PT] ??
                        entry.strategy}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {entry.createdAt.slice(0, 10)}
                    </span>
                  </div>
                  {entry.action && <p className="mt-1">{entry.action}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {entry.ownerName ?? "—"}
                    {entry.dueDate ? ` · prazo ${entry.dueDate}` : ""}
                  </p>
                  {entry.notes && <p className="mt-1 text-xs text-muted-foreground">{entry.notes}</p>}
                </div>
              ))}
            </section>

            {canEdit && (
              <section className="flex flex-col gap-2 rounded-md border border-border p-3">
                <h3 className="text-sm font-semibold">Registrar resposta</h3>
                <div className="grid gap-2">
                  <Label htmlFor="response-strategy">Estratégia *</Label>
                  <select
                    id="response-strategy"
                    value={responseStrategy}
                    onChange={(event) => setResponseStrategy(event.target.value)}
                    className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  >
                    {RISK_RESPONSE_STRATEGIES.map((strategy) => (
                      <option key={strategy} value={strategy}>
                        {RISK_RESPONSE_LABELS_PT[strategy]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="response-action">Ação</Label>
                  <Input
                    id="response-action"
                    value={responseAction}
                    onChange={(event) => setResponseAction(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="response-owner">Responsável</Label>
                  <select
                    id="response-owner"
                    value={responseOwnerId}
                    onChange={(event) => setResponseOwnerId(event.target.value)}
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
                  <Label htmlFor="response-notes">Notas</Label>
                  <textarea
                    id="response-notes"
                    value={responseNotes}
                    onChange={(event) => setResponseNotes(event.target.value)}
                    rows={2}
                    className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => void submitResponse()} disabled={busy || !responseStrategy}>
                    {busy ? "Salvando…" : "Registrar"}
                  </Button>
                </div>
              </section>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
