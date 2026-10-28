"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, ArrowRightLeft, ClipboardCheck } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import {
  CHECKLIST_EXECUTION_ACTION_LABELS_PT,
  CHECKLIST_EXECUTION_STATUS_LABELS_PT,
  CHECKLIST_ITEM_RESULTS,
  CHECKLIST_ITEM_RESULT_LABELS_PT,
  CORRECTIVE_ACTION_ACTION_LABELS_PT,
  CORRECTIVE_ACTION_STATUS_LABELS_PT,
  INSPECTION_ACTION_LABELS_PT,
  INSPECTION_STATUS_LABELS_PT,
  NON_CONFORMITY_ACTION_LABELS_PT,
  NON_CONFORMITY_STATUS_LABELS_PT,
  type ChecklistExecutionStatus,
  type ChecklistItemResult,
  type CorrectiveActionStatus,
  type InspectionStatus,
  type NonConformityStatus,
  type QualityBoardCounts,
} from "@/modules/quality/engine";
import type {
  ChecklistExecutionRow,
  ChecklistTemplateRow,
  CorrectiveActionRow,
  InspectionRow,
  NonConformityRow,
} from "@/modules/quality/selectors";

// Qualidade (E13, §33/§34): modelo de checklist → execução → inspeção com
// critério de aceite e evidência; NCR e ação corretiva fecham o ciclo de
// reprovado (E13-US03/US04). Cinco blocos operacionais em abas.

interface OptionLite {
  id: string;
  label: string;
}

interface Props {
  projectId: string;
  initialTemplates: ChecklistTemplateRow[];
  initialExecutions: ChecklistExecutionRow[];
  initialInspections: InspectionRow[];
  initialNonConformities: NonConformityRow[];
  initialCorrectiveActions: CorrectiveActionRow[];
  board: QualityBoardCounts;
  members: OptionLite[];
  wbsNodes: OptionLite[];
  activities: OptionLite[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

type Tab = "modelos" | "execucoes" | "inspecoes" | "ncrs" | "acoes";

const EXECUTION_STATUS_VARIANT: Record<
  ChecklistExecutionStatus,
  "secondary" | "default" | "warning" | "destructive" | "success"
> = {
  DRAFT: "warning",
  COMPLETED: "success",
  CANCELLED: "secondary",
};

const INSPECTION_STATUS_VARIANT: Record<
  InspectionStatus,
  "secondary" | "default" | "warning" | "destructive" | "success"
> = {
  PLANNED: "secondary",
  EXECUTED: "default",
  PASSED: "success",
  FAILED: "destructive",
  CLOSED: "secondary",
  CANCELLED: "secondary",
};

const NON_CONFORMITY_STATUS_VARIANT: Record<
  NonConformityStatus,
  "secondary" | "default" | "warning" | "destructive" | "success"
> = {
  OPEN: "destructive",
  CORRECTION: "warning",
  VERIFICATION: "default",
  CLOSED: "success",
  CANCELLED: "secondary",
};

const CORRECTIVE_ACTION_STATUS_VARIANT: Record<
  CorrectiveActionStatus,
  "secondary" | "default" | "warning" | "destructive" | "success"
> = {
  OPEN: "secondary",
  IN_PROGRESS: "warning",
  DONE: "default",
  VERIFIED: "default",
  CLOSED: "success",
  CANCELLED: "secondary",
};

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-6 text-center text-sm text-muted-foreground">{text}</p>;
}

interface ItemDraft {
  key: string;
  text: string;
  required: boolean;
  result: ChecklistItemResult | null;
  note: string;
}

const emptyTemplateForm = { name: "", description: "", items: [] as ItemDraft[] };
const emptyExecutionForm = { templateId: "", inspectionId: "", inspectorId: "", notes: "" };
const emptyInspectionForm = {
  title: "",
  description: "",
  inspectionDate: "",
  inspectorId: "",
  wbsNodeId: "",
  activityId: "",
  criterion: "",
};
const emptyNonConformityForm = { title: "", description: "", inspectionId: "" };
const emptyCorrectiveActionForm = {
  nonConformityId: "",
  title: "",
  description: "",
  responsibleId: "",
  dueDate: "",
};

function toItemDraft(item: {
  key: string;
  text: string;
  required: boolean;
  result?: ChecklistItemResult | null;
  note?: string | null;
}): ItemDraft {
  return {
    key: item.key,
    text: item.text,
    required: item.required,
    result: item.result ?? null,
    note: item.note ?? "",
  };
}

export function QualityView({
  projectId,
  initialTemplates,
  initialExecutions,
  initialInspections,
  initialNonConformities,
  initialCorrectiveActions,
  board,
  members,
  wbsNodes,
  activities,
  canCreate,
  canEdit,
  canDelete,
}: Props) {
  const router = useRouter();
  const templateBase = `/api/v1/projects/${projectId}/quality/checklist-templates`;
  const executionBase = `/api/v1/projects/${projectId}/quality/checklist-executions`;
  const inspectionBase = `/api/v1/projects/${projectId}/quality/inspections`;
  const nonConformityBase = `/api/v1/projects/${projectId}/quality/non-conformities`;
  const correctiveActionBase = `/api/v1/projects/${projectId}/quality/corrective-actions`;

  const [tab, setTab] = useState<Tab>("modelos");
  const [templates, setTemplates] = useState<ChecklistTemplateRow[]>(initialTemplates);
  const [executions, setExecutions] = useState<ChecklistExecutionRow[]>(initialExecutions);
  const [inspections, setInspections] = useState<InspectionRow[]>(initialInspections);
  const [nonConformities, setNonConformities] = useState<NonConformityRow[]>(
    initialNonConformities
  );
  const [correctiveActions, setCorrectiveActions] = useState<CorrectiveActionRow[]>(
    initialCorrectiveActions
  );

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [templateDialog, setTemplateDialog] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm);

  const [executionDialog, setExecutionDialog] = useState(false);
  const [executionForm, setExecutionForm] = useState(emptyExecutionForm);

  const [answerDialog, setAnswerDialog] = useState(false);
  const [answerExecutionId, setAnswerExecutionId] = useState<string | null>(null);
  const [answerItems, setAnswerItems] = useState<ItemDraft[]>([]);

  const [inspectionDialog, setInspectionDialog] = useState(false);
  const [editingInspectionId, setEditingInspectionId] = useState<string | null>(null);
  const [inspectionForm, setInspectionForm] = useState(emptyInspectionForm);

  const [ncrDialog, setNcrDialog] = useState(false);
  const [editingNcrId, setEditingNcrId] = useState<string | null>(null);
  const [ncrForm, setNcrForm] = useState(emptyNonConformityForm);

  const [correctiveDialog, setCorrectiveDialog] = useState(false);
  const [editingCorrectiveId, setEditingCorrectiveId] = useState<string | null>(null);
  const [correctiveForm, setCorrectiveForm] = useState(emptyCorrectiveActionForm);

  const [transition, setTransition] = useState<{
    kind: "execution" | "inspection" | "nonConformity" | "correctiveAction";
    id: string;
    code: string;
    action: string;
    reason: string;
    resultNotes: string;
    allowed: string[];
    actionLabels: Record<string, string>;
  } | null>(null);

  const loadAll = async () => {
    try {
      const [t, e, i, n, c] = await Promise.all([
        apiRequest<{ templates: ChecklistTemplateRow[] }>(templateBase),
        apiRequest<{ executions: ChecklistExecutionRow[] }>(executionBase),
        apiRequest<{ inspections: InspectionRow[] }>(inspectionBase),
        apiRequest<{ nonConformities: NonConformityRow[] }>(nonConformityBase),
        apiRequest<{ correctiveActions: CorrectiveActionRow[] }>(correctiveActionBase),
      ]);
      setTemplates(t.templates);
      setExecutions(e.executions);
      setInspections(i.inspections);
      setNonConformities(n.nonConformities);
      setCorrectiveActions(c.correctiveActions);
      setError(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao carregar os dados de qualidade.");
    }
  };

  // --- Modelo de checklist -------------------------------------------------
  const openTemplateCreate = () => {
    setEditingTemplateId(null);
    setTemplateForm({
      name: "",
      description: "",
      items: [{ key: "item-1", text: "", required: true, result: null, note: "" }],
    });
    setError(null);
    setTemplateDialog(true);
  };

  const openTemplateEdit = (template: ChecklistTemplateRow) => {
    setEditingTemplateId(template.id);
    setTemplateForm({
      name: template.name,
      description: template.description ?? "",
      items: template.items.length > 0 ? template.items.map(toItemDraft) : [],
    });
    setError(null);
    setTemplateDialog(true);
  };

  const submitTemplate = async () => {
    setBusy(true);
    setError(null);
    try {
      const items = templateForm.items
        .filter((item) => item.text.trim())
        .map((item, index) => ({
          key: item.key || `item-${index + 1}`,
          text: item.text.trim(),
          required: item.required,
        }));
      const payload: Record<string, unknown> = {
        name: templateForm.name,
        description: templateForm.description || undefined,
        items,
      };
      await apiRequest(editingTemplateId ? `${templateBase}/${editingTemplateId}` : templateBase, {
        method: editingTemplateId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setTemplateDialog(false);
      await loadAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar o modelo.");
    } finally {
      setBusy(false);
    }
  };

  const removeTemplate = async (template: ChecklistTemplateRow) => {
    if (!window.confirm(`Excluir o modelo ${template.code}?`)) return;
    try {
      await apiRequest(`${templateBase}/${template.id}`, { method: "DELETE" });
      await loadAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao excluir o modelo.");
    }
  };

  // --- Execução ------------------------------------------------------------
  const openExecutionCreate = () => {
    setExecutionForm({
      templateId: templates[0]?.id ?? "",
      inspectionId: "",
      inspectorId: "",
      notes: "",
    });
    setError(null);
    setExecutionDialog(true);
  };

  const submitExecution = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(executionBase, {
        method: "POST",
        body: JSON.stringify({
          templateId: executionForm.templateId,
          inspectionId: executionForm.inspectionId || null,
          inspectorId: executionForm.inspectorId || null,
          notes: executionForm.notes || undefined,
          clientUuid: crypto.randomUUID(),
        }),
      });
      setExecutionDialog(false);
      await loadAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao criar a execução.");
    } finally {
      setBusy(false);
    }
  };

  const openAnswers = (execution: ChecklistExecutionRow) => {
    setAnswerExecutionId(execution.id);
    setAnswerItems(execution.items.map(toItemDraft));
    setError(null);
    setAnswerDialog(true);
  };

  const submitAnswers = async () => {
    if (!answerExecutionId) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`${executionBase}/${answerExecutionId}`, {
        method: "PATCH",
        body: JSON.stringify({
          items: answerItems.map((item) => ({
            key: item.key,
            text: item.text,
            required: item.required,
            result: item.result,
            note: item.note || null,
          })),
        }),
      });
      setAnswerDialog(false);
      await loadAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar as respostas.");
    } finally {
      setBusy(false);
    }
  };

  const removeExecution = async (execution: ChecklistExecutionRow) => {
    if (!window.confirm(`Excluir a execução ${execution.code}?`)) return;
    try {
      await apiRequest(`${executionBase}/${execution.id}`, { method: "DELETE" });
      await loadAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao excluir a execução.");
    }
  };

  // --- Inspeção ------------------------------------------------------------
  const openInspectionCreate = () => {
    setEditingInspectionId(null);
    setInspectionForm({
      ...emptyInspectionForm,
      inspectionDate: new Date().toISOString().slice(0, 10),
    });
    setError(null);
    setInspectionDialog(true);
  };

  const openInspectionEdit = (inspection: InspectionRow) => {
    setEditingInspectionId(inspection.id);
    setInspectionForm({
      title: inspection.title,
      description: inspection.description ?? "",
      inspectionDate: inspection.inspectionDate,
      inspectorId: inspection.inspectorId ?? "",
      wbsNodeId: inspection.wbsNodeId ?? "",
      activityId: inspection.activityId ?? "",
      criterion: inspection.criterion,
    });
    setError(null);
    setInspectionDialog(true);
  };

  const submitInspection = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        title: inspectionForm.title,
        description: inspectionForm.description || undefined,
        inspectionDate: inspectionForm.inspectionDate,
        inspectorId: inspectionForm.inspectorId || null,
        wbsNodeId: inspectionForm.wbsNodeId || null,
        activityId: inspectionForm.activityId || null,
        criterion: inspectionForm.criterion,
      };
      await apiRequest(
        editingInspectionId ? `${inspectionBase}/${editingInspectionId}` : inspectionBase,
        {
          method: editingInspectionId ? "PATCH" : "POST",
          body: JSON.stringify(
            editingInspectionId ? payload : { ...payload, clientUuid: crypto.randomUUID() }
          ),
        }
      );
      setInspectionDialog(false);
      await loadAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar a inspeção.");
    } finally {
      setBusy(false);
    }
  };

  const removeInspection = async (inspection: InspectionRow) => {
    if (!window.confirm(`Excluir a inspeção ${inspection.code}?`)) return;
    try {
      await apiRequest(`${inspectionBase}/${inspection.id}`, { method: "DELETE" });
      await loadAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao excluir a inspeção.");
    }
  };

  // --- Não conformidade (NCR) ----------------------------------------------
  const openNcrCreate = () => {
    setEditingNcrId(null);
    setNcrForm({ ...emptyNonConformityForm });
    setError(null);
    setNcrDialog(true);
  };

  const openNcrEdit = (ncr: NonConformityRow) => {
    setEditingNcrId(ncr.id);
    setNcrForm({
      title: ncr.title,
      description: ncr.description,
      inspectionId: ncr.inspectionId ?? "",
    });
    setError(null);
    setNcrDialog(true);
  };

  const submitNonConformity = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        title: ncrForm.title,
        description: ncrForm.description,
        inspectionId: ncrForm.inspectionId || null,
      };
      await apiRequest(
        editingNcrId ? `${nonConformityBase}/${editingNcrId}` : nonConformityBase,
        {
          method: editingNcrId ? "PATCH" : "POST",
          body: JSON.stringify(
            editingNcrId ? payload : { ...payload, clientUuid: crypto.randomUUID() }
          ),
        }
      );
      setNcrDialog(false);
      await loadAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar a não conformidade.");
    } finally {
      setBusy(false);
    }
  };

  const removeNonConformity = async (ncr: NonConformityRow) => {
    if (!window.confirm(`Excluir a não conformidade ${ncr.code}?`)) return;
    try {
      await apiRequest(`${nonConformityBase}/${ncr.id}`, { method: "DELETE" });
      await loadAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao excluir a não conformidade.");
    }
  };

  // --- Ação corretiva -------------------------------------------------------
  const openCorrectiveCreate = () => {
    setEditingCorrectiveId(null);
    setCorrectiveForm({
      ...emptyCorrectiveActionForm,
      nonConformityId: nonConformities.find((ncr) => ncr.status !== "CANCELLED")?.id ?? "",
    });
    setError(null);
    setCorrectiveDialog(true);
  };

  const openCorrectiveEdit = (action: CorrectiveActionRow) => {
    setEditingCorrectiveId(action.id);
    setCorrectiveForm({
      nonConformityId: action.nonConformityId,
      title: action.title,
      description: action.description,
      responsibleId: action.responsibleId ?? "",
      dueDate: action.dueDate ?? "",
    });
    setError(null);
    setCorrectiveDialog(true);
  };

  const submitCorrectiveAction = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        title: correctiveForm.title,
        description: correctiveForm.description,
        responsibleId: correctiveForm.responsibleId || null,
        dueDate: correctiveForm.dueDate || undefined,
      };
      await apiRequest(
        editingCorrectiveId
          ? `${correctiveActionBase}/${editingCorrectiveId}`
          : correctiveActionBase,
        {
          method: editingCorrectiveId ? "PATCH" : "POST",
          body: JSON.stringify(
            editingCorrectiveId
              ? payload
              : {
                  ...payload,
                  nonConformityId: correctiveForm.nonConformityId,
                  clientUuid: crypto.randomUUID(),
                }
          ),
        }
      );
      setCorrectiveDialog(false);
      await loadAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar a ação corretiva.");
    } finally {
      setBusy(false);
    }
  };

  const removeCorrectiveAction = async (action: CorrectiveActionRow) => {
    if (!window.confirm(`Excluir a ação corretiva ${action.code}?`)) return;
    try {
      await apiRequest(`${correctiveActionBase}/${action.id}`, { method: "DELETE" });
      await loadAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao excluir a ação corretiva.");
    }
  };

  // --- Transições ----------------------------------------------------------
  const openTransition = (
    kind: "execution" | "inspection" | "nonConformity" | "correctiveAction",
    id: string,
    code: string,
    allowed: string[],
    actionLabels: Record<string, string>
  ) => {
    setTransition({ kind, id, code, action: "", reason: "", resultNotes: "", allowed, actionLabels });
    setError(null);
  };

  const submitTransition = async () => {
    if (!transition || !transition.action) return;
    setBusy(true);
    setError(null);
    try {
      const baseByKind = {
        execution: executionBase,
        inspection: inspectionBase,
        nonConformity: nonConformityBase,
        correctiveAction: correctiveActionBase,
      } as const;
      const notes = transition.resultNotes || undefined;
      const payload: Record<string, unknown> = {
        action: transition.action,
        reason: transition.reason || undefined,
      };
      // Cada máquina tem sua própria nota obrigatória no momento da virada.
      if (transition.kind === "inspection" && transition.action === "FAIL") {
        payload.resultNotes = notes;
      } else if (transition.kind === "nonConformity" && transition.action === "SUBMIT") {
        payload.correctionNotes = notes;
      } else if (transition.kind === "nonConformity" && transition.action === "VERIFY") {
        payload.verificationNotes = notes;
      } else if (transition.kind === "correctiveAction" && transition.action === "COMPLETE") {
        payload.actionNotes = notes;
      } else if (transition.kind === "correctiveAction" && transition.action === "VERIFY") {
        payload.verificationNotes = notes;
      }
      await apiRequest(`${baseByKind[transition.kind]}/${transition.id}/status`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setTransition(null);
      await loadAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha na transição de status.");
    } finally {
      setBusy(false);
    }
  };

  const setTransitionField = (key: "action" | "reason" | "resultNotes", value: string) =>
    setTransition((previous) => (previous ? { ...previous, [key]: value } : previous));

  // Rótulo da nota obrigatória por transição (o servidor valida o mesmo).
  const transitionNotesLabel = (() => {
    if (!transition) return null;
    const { kind, action } = transition;
    if (kind === "inspection" && action === "FAIL") return "Não conformidade observada *";
    if (kind === "nonConformity" && action === "SUBMIT") return "Correção aplicada *";
    if (kind === "nonConformity" && action === "VERIFY") return "Verificação da correção *";
    if (kind === "correctiveAction" && action === "COMPLETE") return "Execução da correção *";
    if (kind === "correctiveAction" && action === "VERIFY") return "Verificação da correção *";
    return null;
  })();
  const transitionNotesRequired = transitionNotesLabel !== null;

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "modelos", label: "Modelos", count: templates.length },
    { id: "execucoes", label: "Execuções", count: executions.length },
    { id: "inspecoes", label: "Inspeções", count: inspections.filter((item) => item.isOpen).length },
    { id: "ncrs", label: "Não conformidades", count: nonConformities.filter((item) => item.isOpen).length },
    { id: "acoes", label: "Ações corretivas", count: correctiveActions.filter((item) => item.isOpen).length },
  ];

  const inspectionOptions = inspections.filter((item) => item.status !== "CANCELLED");

  return (
    <div className="flex flex-col gap-6">
      <ErrorBox message={error} />

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Quadro de qualidade</h2>
          <span className="text-xs text-muted-foreground">Modelo · execução · inspeção · §33</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Modelos", value: board.templates },
            { label: "Execuções em preenchimento", value: board.executionsPending },
            { label: "Inspeções abertas", value: board.open },
            { label: "Planejadas", value: board.planned },
            { label: "Reprovadas", value: board.failed },
            { label: "Encerradas", value: board.closed },
            { label: "NCR abertas", value: board.nonConformitiesOpen },
            { label: "Ações corretivas abertas", value: board.correctiveActionsOpen },
          ].map((cell) => (
            <div key={cell.label} className="rounded-md border border-border bg-surface p-2">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {cell.label}
              </div>
              <div className="text-lg font-medium">{cell.value}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={
                tab === item.id
                  ? "rounded-md bg-accent px-3 py-1.5 text-sm font-medium"
                  : "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              }
            >
              {item.label} <span className="text-xs">({item.count})</span>
            </button>
          ))}
        </div>

        {canCreate && tab === "modelos" && (
          <Button onClick={openTemplateCreate}>
            <Plus className="h-4 w-4" />
            Novo modelo
          </Button>
        )}
        {canCreate && tab === "execucoes" && templates.length > 0 && (
          <Button onClick={openExecutionCreate}>
            <Plus className="h-4 w-4" />
            Nova execução
          </Button>
        )}
        {canCreate && tab === "inspecoes" && (
          <Button onClick={openInspectionCreate}>
            <Plus className="h-4 w-4" />
            Nova inspeção
          </Button>
        )}
        {canCreate && tab === "ncrs" && (
          <Button onClick={openNcrCreate}>
            <Plus className="h-4 w-4" />
            Nova não conformidade
          </Button>
        )}
        {canCreate && tab === "acoes" && nonConformities.length > 0 && (
          <Button onClick={openCorrectiveCreate}>
            <Plus className="h-4 w-4" />
            Nova ação corretiva
          </Button>
        )}
      </div>

      {tab === "modelos" && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Modelos de checklist (E13-US01)</h2>
              <p className="text-xs text-muted-foreground">
                Itens com obrigatoriedade — a resposta nasce na execução.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2.5">Código</th>
                  <th className="px-4 py-2.5">Nome</th>
                  <th className="px-4 py-2.5 text-center">Itens</th>
                  <th className="px-4 py-2.5 text-center">Obrigatórios</th>
                  <th className="px-4 py-2.5 text-center">Execuções</th>
                  {(canEdit || canDelete) && <th className="px-4 py-2.5 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {templates.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <Empty text="Nenhum modelo de checklist criado." />
                    </td>
                  </tr>
                )}
                {templates.map((template) => (
                  <tr key={template.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs">{template.code}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{template.name}</div>
                      {template.description && (
                        <div className="text-xs text-muted-foreground">{template.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">{template.itemCount}</td>
                    <td className="px-4 py-2.5 text-center">{template.requiredCount}</td>
                    <td className="px-4 py-2.5 text-center">{template.executionCount}</td>
                    {(canEdit || canDelete) && (
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Editar modelo"
                              onClick={() => openTemplateEdit(template)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Excluir modelo"
                              onClick={() => void removeTemplate(template)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "execucoes" && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Execuções de checklist (§33)</h2>
              <p className="text-xs text-muted-foreground">
                Item só conclui ao atingir o critério — COMPLETE exige todos os obrigatórios
                respondidos.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2.5">Código</th>
                  <th className="px-4 py-2.5">Modelo</th>
                  <th className="px-4 py-2.5">Inspeção</th>
                  <th className="px-4 py-2.5">Progresso</th>
                  <th className="px-4 py-2.5">Status</th>
                  {(canEdit || canDelete) && <th className="px-4 py-2.5 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {executions.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <Empty text="Nenhuma execução de checklist." />
                    </td>
                  </tr>
                )}
                {executions.map((execution) => (
                  <tr key={execution.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs">{execution.code}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{execution.templateName}</div>
                      <div className="text-xs text-muted-foreground">{execution.templateCode}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      {execution.inspectionCode ? (
                        <span className="font-mono text-xs">{execution.inspectionCode}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-xs">
                        {execution.summary.answered}/{execution.summary.total} respondidos
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {execution.summary.failed} não conforme
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={EXECUTION_STATUS_VARIANT[execution.status]}>
                        {CHECKLIST_EXECUTION_STATUS_LABELS_PT[execution.status]}
                      </Badge>
                    </td>
                    {(canEdit || canDelete) && (
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          {execution.actions.length > 0 && canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Transição de status"
                              onClick={() =>
                                openTransition(
                                  "execution",
                                  execution.id,
                                  execution.code,
                                  execution.actions,
                                  CHECKLIST_EXECUTION_ACTION_LABELS_PT
                                )
                              }
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canEdit && execution.editable && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Responder itens"
                              onClick={() => openAnswers(execution)}
                            >
                              <ClipboardCheck className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canDelete && execution.status !== "COMPLETED" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Excluir execução"
                              onClick={() => void removeExecution(execution)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "inspecoes" && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Inspeções (E13-US02, §33)</h2>
              <p className="text-xs text-muted-foreground">
                Planned → Executed → Passed / Failed → Closed; PASS/FAIL exigem evidência.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2.5">Código</th>
                  <th className="px-4 py-2.5">Título</th>
                  <th className="px-4 py-2.5">Data</th>
                  <th className="px-4 py-2.5">Responsável</th>
                  <th className="px-4 py-2.5 text-center">Evidências</th>
                  <th className="px-4 py-2.5">Status</th>
                  {(canEdit || canDelete) && <th className="px-4 py-2.5 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {inspections.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <Empty text="Nenhuma inspeção registrada." />
                    </td>
                  </tr>
                )}
                {inspections.map((inspection) => (
                  <tr key={inspection.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs">{inspection.code}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{inspection.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {inspection.activityCode ?? inspection.wbsNodeCode ?? "—"}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">{inspection.inspectionDate}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {inspection.inspectorName ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        title={`${inspection.photoCount} foto(s) · ${inspection.completedChecklistCount} checklist(s) concluído(s)`}
                      >
                        {inspection.photoCount + inspection.completedChecklistCount}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={INSPECTION_STATUS_VARIANT[inspection.status]}>
                        {INSPECTION_STATUS_LABELS_PT[inspection.status]}
                      </Badge>
                    </td>
                    {(canEdit || canDelete) && (
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          {inspection.actions.length > 0 && canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Transição de status"
                              onClick={() =>
                                openTransition(
                                  "inspection",
                                  inspection.id,
                                  inspection.code,
                                  inspection.actions,
                                  INSPECTION_ACTION_LABELS_PT
                                )
                              }
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canEdit && inspection.editable && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Editar inspeção"
                              onClick={() => openInspectionEdit(inspection)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canDelete &&
                            (inspection.status === "PLANNED" ||
                              inspection.status === "CANCELLED") && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Excluir inspeção"
                                onClick={() => void removeInspection(inspection)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "ncrs" && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Não conformidades (E13-US03, §33)</h2>
              <p className="text-xs text-muted-foreground">
                Aberta → Em correção → Em verificação → Encerrada; a reprovação de inspeção gera
                o NCR automaticamente.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2.5">Código</th>
                  <th className="px-4 py-2.5">Título</th>
                  <th className="px-4 py-2.5">Inspeção</th>
                  <th className="px-4 py-2.5 text-center">Ações corretivas</th>
                  <th className="px-4 py-2.5">Status</th>
                  {(canEdit || canDelete) && <th className="px-4 py-2.5 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {nonConformities.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <Empty text="Nenhuma não conformidade registrada." />
                    </td>
                  </tr>
                )}
                {nonConformities.map((ncr) => (
                  <tr key={ncr.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs">{ncr.code}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{ncr.title}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {ncr.description}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {ncr.inspectionCode ? `${ncr.inspectionCode} — ${ncr.inspectionTitle}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        title={`${ncr.correctiveActionCount} ação(ões) corretiva(s) · ${ncr.openCorrectiveActionCount} aberta(s)`}
                      >
                        {ncr.correctiveActionCount}
                        {ncr.openCorrectiveActionCount > 0 && (
                          <span className="text-destructive"> ({ncr.openCorrectiveActionCount})</span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={NON_CONFORMITY_STATUS_VARIANT[ncr.status]}>
                        {NON_CONFORMITY_STATUS_LABELS_PT[ncr.status]}
                      </Badge>
                    </td>
                    {(canEdit || canDelete) && (
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          {ncr.actions.length > 0 && canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Transição de status"
                              onClick={() =>
                                openTransition(
                                  "nonConformity",
                                  ncr.id,
                                  ncr.code,
                                  ncr.actions,
                                  NON_CONFORMITY_ACTION_LABELS_PT
                                )
                              }
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canEdit && ncr.editable && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Editar não conformidade"
                              onClick={() => openNcrEdit(ncr)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canDelete && ncr.editable && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Excluir não conformidade"
                              onClick={() => void removeNonConformity(ncr)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "acoes" && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Ações corretivas (E13-US04, §33)</h2>
              <p className="text-xs text-muted-foreground">
                Aberta → Em andamento → Concluída → Verificada → Encerrada; vinculadas a um NCR.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2.5">Código</th>
                  <th className="px-4 py-2.5">Título</th>
                  <th className="px-4 py-2.5">NCR</th>
                  <th className="px-4 py-2.5">Responsável</th>
                  <th className="px-4 py-2.5">Prazo</th>
                  <th className="px-4 py-2.5">Status</th>
                  {(canEdit || canDelete) && <th className="px-4 py-2.5 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {correctiveActions.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <Empty text="Nenhuma ação corretiva registrada." />
                    </td>
                  </tr>
                )}
                {correctiveActions.map((action) => (
                  <tr key={action.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs">{action.code}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{action.title}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {action.description}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {action.nonConformityCode}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {action.responsibleName ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{action.dueDate ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={CORRECTIVE_ACTION_STATUS_VARIANT[action.status]}>
                        {CORRECTIVE_ACTION_STATUS_LABELS_PT[action.status]}
                      </Badge>
                    </td>
                    {(canEdit || canDelete) && (
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          {action.actions.length > 0 && canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Transição de status"
                              onClick={() =>
                                openTransition(
                                  "correctiveAction",
                                  action.id,
                                  action.code,
                                  action.actions,
                                  CORRECTIVE_ACTION_ACTION_LABELS_PT
                                )
                              }
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canEdit && action.editable && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Editar ação corretiva"
                              onClick={() => openCorrectiveEdit(action)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canDelete && action.editable && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Excluir ação corretiva"
                              onClick={() => void removeCorrectiveAction(action)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Modelo de checklist */}
      <Dialog
        open={templateDialog}
        title={editingTemplateId ? "Editar modelo" : "Novo modelo de checklist"}
        onClose={() => setTemplateDialog(false)}
        wide
      >
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="template-name">Nome *</Label>
            <Input
              id="template-name"
              value={templateForm.name}
              onChange={(event) =>
                setTemplateForm((previous) => ({ ...previous, name: event.target.value }))
              }
              placeholder="Ex.: Checklist de fundações"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="template-description">Descrição</Label>
            <textarea
              id="template-description"
              value={templateForm.description}
              onChange={(event) =>
                setTemplateForm((previous) => ({ ...previous, description: event.target.value }))
              }
              rows={2}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>Itens *</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setTemplateForm((previous) => ({
                    ...previous,
                    items: [
                      ...previous.items,
                      {
                        key: `item-${previous.items.length + 1}`,
                        text: "",
                        required: false,
                        result: null,
                        note: "",
                      },
                    ],
                  }))
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar item
              </Button>
            </div>
            {templateForm.items.map((item, index) => (
              <div key={item.key} className="flex items-center gap-2">
                <Input
                  value={item.text}
                  placeholder={`Item ${index + 1}`}
                  onChange={(event) =>
                    setTemplateForm((previous) => ({
                      ...previous,
                      items: previous.items.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, text: event.target.value } : row
                      ),
                    }))
                  }
                />
                <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={item.required}
                    onChange={(event) =>
                      setTemplateForm((previous) => ({
                        ...previous,
                        items: previous.items.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, required: event.target.checked } : row
                        ),
                      }))
                    }
                  />
                  Obrigatório
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Remover item"
                  onClick={() =>
                    setTemplateForm((previous) => ({
                      ...previous,
                      items: previous.items.filter((_, rowIndex) => rowIndex !== index),
                    }))
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setTemplateDialog(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => void submitTemplate()}
            disabled={
              busy ||
              !templateForm.name.trim() ||
              templateForm.items.filter((item) => item.text.trim()).length === 0
            }
          >
            {busy ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </Dialog>

      {/* Nova execução */}
      <Dialog
        open={executionDialog}
        title="Nova execução de checklist"
        onClose={() => setExecutionDialog(false)}
        wide
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="execution-template">Modelo *</Label>
            <select
              id="execution-template"
              value={executionForm.templateId}
              onChange={(event) =>
                setExecutionForm((previous) => ({ ...previous, templateId: event.target.value }))
              }
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">— selecionar —</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.code} — {template.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="execution-inspection">Inspeção</Label>
            <select
              id="execution-inspection"
              value={executionForm.inspectionId}
              onChange={(event) =>
                setExecutionForm((previous) => ({ ...previous, inspectionId: event.target.value }))
              }
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">— sem vínculo —</option>
              {inspectionOptions.map((inspection) => (
                <option key={inspection.id} value={inspection.id}>
                  {inspection.code} — {inspection.title}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="execution-inspector">Responsável</Label>
            <select
              id="execution-inspector"
              value={executionForm.inspectorId}
              onChange={(event) =>
                setExecutionForm((previous) => ({ ...previous, inspectorId: event.target.value }))
              }
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">— selecionar —</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="execution-notes">Observações</Label>
            <textarea
              id="execution-notes"
              value={executionForm.notes}
              onChange={(event) =>
                setExecutionForm((previous) => ({ ...previous, notes: event.target.value }))
              }
              rows={2}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setExecutionDialog(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => void submitExecution()}
            disabled={busy || !executionForm.templateId}
          >
            {busy ? "Criando…" : "Criar"}
          </Button>
        </div>
      </Dialog>

      {/* Responder itens da execução */}
      <Dialog
        open={answerDialog}
        title="Responder itens do checklist"
        onClose={() => setAnswerDialog(false)}
        wide
      >
        <div className="flex flex-col gap-3">
          {answerItems.length === 0 && <Empty text="Este modelo não possui itens." />}
          {answerItems.map((item, index) => (
            <div key={item.key} className="rounded-md border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm">
                  {item.text}
                  {item.required && <span className="text-destructive"> *</span>}
                </div>
                <select
                  value={item.result ?? ""}
                  onChange={(event) =>
                    setAnswerItems((previous) =>
                      previous.map((row, rowIndex) =>
                        rowIndex === index
                          ? { ...row, result: (event.target.value || null) as ChecklistItemResult | null }
                          : row
                      )
                    )
                  }
                  className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
                >
                  <option value="">— pendente —</option>
                  {CHECKLIST_ITEM_RESULTS.map((result) => (
                    <option key={result} value={result}>
                      {CHECKLIST_ITEM_RESULT_LABELS_PT[result]}
                    </option>
                  ))}
                </select>
              </div>
              <input
                value={item.note}
                placeholder="Observação (opcional)"
                onChange={(event) =>
                  setAnswerItems((previous) =>
                    previous.map((row, rowIndex) =>
                      rowIndex === index ? { ...row, note: event.target.value } : row
                    )
                  )
                }
                className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setAnswerDialog(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void submitAnswers()} disabled={busy}>
            {busy ? "Salvando…" : "Salvar respostas"}
          </Button>
        </div>
      </Dialog>

      {/* Inspeção */}
      <Dialog
        open={inspectionDialog}
        title={editingInspectionId ? "Editar inspeção" : "Nova inspeção"}
        onClose={() => setInspectionDialog(false)}
        wide
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="inspection-title">Título *</Label>
            <Input
              id="inspection-title"
              value={inspectionForm.title}
              onChange={(event) =>
                setInspectionForm((previous) => ({ ...previous, title: event.target.value }))
              }
              placeholder="Ex.: Inspeção de armadura — pilar P03"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="inspection-date">Data da inspeção *</Label>
            <Input
              id="inspection-date"
              type="date"
              value={inspectionForm.inspectionDate}
              onChange={(event) =>
                setInspectionForm((previous) => ({
                  ...previous,
                  inspectionDate: event.target.value,
                }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="inspection-inspector">Inspetor</Label>
            <select
              id="inspection-inspector"
              value={inspectionForm.inspectorId}
              onChange={(event) =>
                setInspectionForm((previous) => ({ ...previous, inspectorId: event.target.value }))
              }
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">— selecionar —</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="inspection-activity">Atividade</Label>
            <select
              id="inspection-activity"
              value={inspectionForm.activityId}
              onChange={(event) =>
                setInspectionForm((previous) => ({ ...previous, activityId: event.target.value }))
              }
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">— projeto inteiro —</option>
              {activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="inspection-wbs">Pacote WBS</Label>
            <select
              id="inspection-wbs"
              value={inspectionForm.wbsNodeId}
              onChange={(event) =>
                setInspectionForm((previous) => ({ ...previous, wbsNodeId: event.target.value }))
              }
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
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="inspection-criterion">Critério de aceite *</Label>
            <textarea
              id="inspection-criterion"
              value={inspectionForm.criterion}
              onChange={(event) =>
                setInspectionForm((previous) => ({ ...previous, criterion: event.target.value }))
              }
              rows={2}
              placeholder="Ex.: armadura conferida x projeto, sem desvio > 5 mm"
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="inspection-description">Descrição</Label>
            <textarea
              id="inspection-description"
              value={inspectionForm.description}
              onChange={(event) =>
                setInspectionForm((previous) => ({ ...previous, description: event.target.value }))
              }
              rows={2}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setInspectionDialog(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => void submitInspection()}
            disabled={
              busy ||
              !inspectionForm.title.trim() ||
              !inspectionForm.inspectionDate ||
              !inspectionForm.criterion.trim()
            }
          >
            {busy ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </Dialog>

      {/* Não conformidade (NCR) */}
      <Dialog
        open={ncrDialog}
        title={editingNcrId ? "Editar não conformidade" : "Nova não conformidade"}
        onClose={() => setNcrDialog(false)}
        wide
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="ncr-title">Título *</Label>
            <Input
              id="ncr-title"
              value={ncrForm.title}
              onChange={(event) =>
                setNcrForm((previous) => ({ ...previous, title: event.target.value }))
              }
              placeholder="Ex.: Desvio de nivelamento — laje L02"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ncr-inspection">Inspeção de origem</Label>
            <select
              id="ncr-inspection"
              value={ncrForm.inspectionId}
              onChange={(event) =>
                setNcrForm((previous) => ({ ...previous, inspectionId: event.target.value }))
              }
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">— sem vínculo —</option>
              {inspectionOptions.map((inspection) => (
                <option key={inspection.id} value={inspection.id}>
                  {inspection.code} — {inspection.title}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="ncr-description">Descrição do desvio *</Label>
            <textarea
              id="ncr-description"
              value={ncrForm.description}
              onChange={(event) =>
                setNcrForm((previous) => ({ ...previous, description: event.target.value }))
              }
              rows={3}
              placeholder="Descreva o que foi constatado e o critério descumprido"
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setNcrDialog(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => void submitNonConformity()}
            disabled={busy || !ncrForm.title.trim() || !ncrForm.description.trim()}
          >
            {busy ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </Dialog>

      {/* Ação corretiva */}
      <Dialog
        open={correctiveDialog}
        title={editingCorrectiveId ? "Editar ação corretiva" : "Nova ação corretiva"}
        onClose={() => setCorrectiveDialog(false)}
        wide
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="corrective-ncr">Não conformidade *</Label>
            <select
              id="corrective-ncr"
              value={correctiveForm.nonConformityId}
              onChange={(event) =>
                setCorrectiveForm((previous) => ({
                  ...previous,
                  nonConformityId: event.target.value,
                }))
              }
              disabled={editingCorrectiveId !== null}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm disabled:opacity-60"
            >
              <option value="">— selecionar —</option>
              {nonConformities
                .filter((ncr) => ncr.status !== "CANCELLED")
                .map((ncr) => (
                  <option key={ncr.id} value={ncr.id}>
                    {ncr.code} — {ncr.title}
                  </option>
                ))}
            </select>
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="corrective-title">Título *</Label>
            <Input
              id="corrective-title"
              value={correctiveForm.title}
              onChange={(event) =>
                setCorrectiveForm((previous) => ({ ...previous, title: event.target.value }))
              }
              placeholder="Ex.: Reprocessar nivelamento da laje L02"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="corrective-responsible">Responsável</Label>
            <select
              id="corrective-responsible"
              value={correctiveForm.responsibleId}
              onChange={(event) =>
                setCorrectiveForm((previous) => ({ ...previous, responsibleId: event.target.value }))
              }
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">— selecionar —</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="corrective-due">Prazo</Label>
            <Input
              id="corrective-due"
              type="date"
              value={correctiveForm.dueDate}
              onChange={(event) =>
                setCorrectiveForm((previous) => ({ ...previous, dueDate: event.target.value }))
              }
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="corrective-description">Descrição *</Label>
            <textarea
              id="corrective-description"
              value={correctiveForm.description}
              onChange={(event) =>
                setCorrectiveForm((previous) => ({ ...previous, description: event.target.value }))
              }
              rows={3}
              placeholder="Descreva a correção a ser executada"
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setCorrectiveDialog(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => void submitCorrectiveAction()}
            disabled={
              busy ||
              !correctiveForm.title.trim() ||
              !correctiveForm.description.trim() ||
              (!editingCorrectiveId && !correctiveForm.nonConformityId)
            }
          >
            {busy ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </Dialog>

      {/* Transição de status */}
      <Dialog
        open={transition !== null}
        title={transition ? `${transition.code} — mudar status` : "Status"}
        onClose={() => setTransition(null)}
      >
        {transition && (
          <div className="flex flex-col gap-3">
            <div className="grid gap-2">
              <Label htmlFor="transition-action">Ação *</Label>
              <select
                id="transition-action"
                value={transition.action}
                onChange={(event) => setTransitionField("action", event.target.value)}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                <option value="">— selecionar —</option>
                {transition.allowed.map((action) => (
                  <option key={action} value={action}>
                    {transition.actionLabels[action] ?? action}
                  </option>
                ))}
              </select>
            </div>

            {transitionNotesLabel && transition.kind !== "execution" && (
              <div className="grid gap-2">
                <Label htmlFor="transition-notes">{transitionNotesLabel}</Label>
                <textarea
                  id="transition-notes"
                  value={transition.resultNotes}
                  onChange={(event) => setTransitionField("resultNotes", event.target.value)}
                  rows={3}
                  placeholder="Registre o que foi feito ou constatado (§33)"
                  className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
                />
              </div>
            )}

            {transition.action === "CANCEL" && (
              <div className="grid gap-2">
                <Label htmlFor="transition-reason">Motivo *</Label>
                <textarea
                  id="transition-reason"
                  value={transition.reason}
                  onChange={(event) => setTransitionField("reason", event.target.value)}
                  rows={2}
                  className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setTransition(null)}>
                Cancelar
              </Button>
              <Button
                onClick={() => void submitTransition()}
                disabled={
                  busy ||
                  !transition.action ||
                  (transitionNotesRequired && !transition.resultNotes.trim()) ||
                  (transition.action === "CANCEL" && !transition.reason.trim())
                }
              >
                {busy ? "Aplicando…" : "Aplicar"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
