"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookmarkPlus, CalendarCheck, Check, Pencil, Plus, Route, Send, Trash2, Upload } from "lucide-react";
import type { ActivityRow, DependencyRow } from "@/modules/schedule/selectors";
import type { BaselineRow } from "@/modules/schedule/baselines";
import type { CalendarRow } from "@/modules/schedule/calendars";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";

// Cronograma (E07-US01/US02/US04/US05/US06): tabela de atividades, dependências,
// recálculo do caminho crítico, baseline (snapshot imutável) e forecast —
// float/crítico exibidos vêm sempre do motor.

const TYPE_LABELS: Record<string, string> = {
  TASK: "Tarefa",
  MILESTONE: "Marco",
  SUMMARY: "Resumo",
};

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Não iniciada",
  IN_PROGRESS: "Em execução",
  COMPLETED: "Concluída",
  ON_HOLD: "Suspensa",
  CANCELLED: "Cancelada",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  NOT_STARTED: "secondary",
  IN_PROGRESS: "default",
  COMPLETED: "success",
  ON_HOLD: "warning",
  CANCELLED: "destructive",
};

const DEPENDENCY_LABELS: Record<string, string> = {
  FS: "Fim–Início",
  SS: "Início–Início",
  FF: "Fim–Fim",
  SF: "Início–Fim",
};

const BASELINE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  SUBMITTED: "Submetida",
  APPROVED: "Aprovada",
  SUPERSEDED: "Substituída",
};

const BASELINE_STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  DRAFT: "secondary",
  SUBMITTED: "warning",
  APPROVED: "success",
  SUPERSEDED: "destructive",
};

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

const selectClass = "h-9 rounded-md border border-border bg-surface px-2 text-sm";

interface ActivityForm {
  code: string;
  name: string;
  activityType: string;
  duration: string;
  plannedStart: string;
  plannedFinish: string;
  wbsNodeId: string;
  calendarId: string;
  status: string;
  physicalProgress: string;
}

const emptyActivityForm: ActivityForm = {
  code: "",
  name: "",
  activityType: "TASK",
  duration: "1",
  plannedStart: "",
  plannedFinish: "",
  wbsNodeId: "",
  calendarId: "",
  status: "NOT_STARTED",
  physicalProgress: "0",
};

interface DependencyForm {
  predecessorId: string;
  successorId: string;
  type: string;
  lag: string;
}

const emptyDependencyForm: DependencyForm = {
  predecessorId: "",
  successorId: "",
  type: "FS",
  lag: "0",
};

interface CalendarForm {
  code: string;
  name: string;
  scope: "PROJECT" | "ORGANIZATION";
  week: number[];
  holidaysText: string;
  isDefault: boolean;
}

const emptyCalendarForm: CalendarForm = {
  code: "",
  name: "",
  scope: "PROJECT",
  week: [1, 2, 3, 4, 5],
  holidaysText: "",
  isDefault: false,
};

interface CpmSummary {
  projectFinish: string;
  criticalCount: number;
  activityCount: number;
}

export interface ScheduleTemplateOption {
  id: string;
  code: string;
  name: string;
  activityCount: number;
  dependencyCount: number;
}

export function ScheduleView({
  projectId,
  activities,
  dependencies,
  baselines,
  calendars,
  wbsNodes,
  scheduleTemplates,
  canCreate,
  canEdit,
  canDelete,
  canApprove,
}: {
  projectId: string;
  activities: ActivityRow[];
  dependencies: DependencyRow[];
  baselines: BaselineRow[];
  calendars: CalendarRow[];
  wbsNodes: { id: string; code: string; name: string }[];
  scheduleTemplates: ScheduleTemplateOption[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"activity" | "dependency" | "baseline" | "calendar" | "import" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ActivityForm>(emptyActivityForm);
  const [dependencyForm, setDependencyForm] = useState<DependencyForm>(emptyDependencyForm);
  const [baselineReason, setBaselineReason] = useState("");
  const [editingCalendarId, setEditingCalendarId] = useState<string | null>(null);
  const [calendarForm, setCalendarForm] = useState<CalendarForm>(emptyCalendarForm);
  const [cpm, setCpm] = useState<CpmSummary | null>(null);
  const [cpmBusy, setCpmBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<"file" | "template">("file");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importTemplateId, setImportTemplateId] = useState("");
  const [importCalendarId, setImportCalendarId] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [applyBusyId, setApplyBusyId] = useState<string | null>(null);

  const set = (key: keyof ActivityForm, value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const setDependency = (key: keyof DependencyForm, value: string) =>
    setDependencyForm((previous) => ({ ...previous, [key]: value }));

  const run = async (message: string, request: () => Promise<unknown>) => {
    setError(null);
    setNotice(null);
    try {
      await request();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : message);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyActivityForm);
    setError(null);
    setDialog("activity");
  };

  const openEdit = (activity: ActivityRow) => {
    setEditingId(activity.id);
    setForm({
      code: activity.code,
      name: activity.name,
      activityType: activity.activityType,
      duration: String(activity.duration),
      plannedStart: activity.plannedStart ?? "",
      plannedFinish: activity.plannedFinish ?? "",
      wbsNodeId: activity.wbsNodeId ?? "",
      calendarId: activity.calendarId ?? "",
      status: activity.status,
      physicalProgress: String(activity.physicalProgress),
    });
    setError(null);
    setDialog("activity");
  };

  const submitActivity = async () => {
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        activityType: form.activityType,
        duration: Number(form.duration),
        plannedStart: form.plannedStart || null,
        plannedFinish: form.plannedFinish || null,
        wbsNodeId: form.wbsNodeId || null,
        calendarId: form.calendarId || null,
        status: form.status,
      };
      if (form.code.trim()) payload.code = form.code.trim();

      let activityId = editingId;
      if (editingId) {
        const result = await apiRequest<{ activity: { id: string } }>(
          `/api/v1/projects/${projectId}/activities/${editingId}`,
          { method: "PATCH", body: JSON.stringify(payload) }
        );
        activityId = result.activity.id;
      } else {
        const result = await apiRequest<{ activity: { id: string } }>(
          `/api/v1/projects/${projectId}/activities`,
          { method: "POST", body: JSON.stringify(payload) }
        );
        activityId = result.activity.id;
      }

      if (editingId) {
        await apiRequest(`/api/v1/projects/${projectId}/activities/${activityId}/progress`, {
          method: "POST",
          body: JSON.stringify({
            physicalProgress: Number(form.physicalProgress),
            status: form.status,
          }),
        });
      }

      setDialog(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar atividade.");
    }
  };

  const removeActivity = async (activity: ActivityRow) => {
    if (!window.confirm(`Excluir a atividade ${activity.code} — ${activity.name}?`)) return;
    await run("Falha ao excluir.", () =>
      apiRequest(`/api/v1/projects/${projectId}/activities/${activity.id}`, { method: "DELETE" })
    );
  };

  const submitDependency = async () => {
    setError(null);
    try {
      await apiRequest(`/api/v1/projects/${projectId}/dependencies`, {
        method: "POST",
        body: JSON.stringify({
          predecessorId: dependencyForm.predecessorId,
          successorId: dependencyForm.successorId,
          type: dependencyForm.type,
          lag: Number(dependencyForm.lag),
        }),
      });
      setDependencyForm(emptyDependencyForm);
      setDialog(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao criar dependência.");
    }
  };

  const removeDependency = async (dependency: DependencyRow) => {
    if (
      !window.confirm(
        `Remover dependência ${dependency.predecessorCode} → ${dependency.successorCode}?`
      )
    ) {
      return;
    }
    await run("Falha ao remover dependência.", () =>
      apiRequest(`/api/v1/projects/${projectId}/dependencies/${dependency.id}`, {
        method: "DELETE",
      })
    );
  };

  const recalculate = async () => {
    setError(null);
    setCpmBusy(true);
    try {
      const result = await apiRequest<{ cpm: CpmSummary }>(
        `/api/v1/projects/${projectId}/schedule/cpm`
      );
      setCpm(result.cpm);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao recalcular o CPM.");
    } finally {
      setCpmBusy(false);
    }
  };

  const createBaseline = async () => {
    setError(null);
    try {
      await apiRequest(`/api/v1/projects/${projectId}/baselines`, {
        method: "POST",
        body: JSON.stringify({ type: "SCHEDULE", reason: baselineReason || undefined }),
      });
      setBaselineReason("");
      setDialog(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao criar a baseline.");
    }
  };

  const baselineAction = async (baseline: BaselineRow, action: "SUBMIT" | "APPROVE" | "REJECT") => {
    if (action === "APPROVE" && !window.confirm(`Aprovar a baseline v${baseline.version}? Ela ficará imutável.`)) {
      return;
    }
    if (action === "REJECT" && !window.confirm(`Rejeitar a baseline v${baseline.version} e devolvê-la para rascunho?`)) {
      return;
    }
    await run("Falha na ação da baseline.", () =>
      apiRequest(`/api/v1/projects/${projectId}/baselines/${baseline.id}/status`, {
        method: "POST",
        body: JSON.stringify({ action }),
      })
    );
  };

  const removeBaseline = async (baseline: BaselineRow) => {
    if (!window.confirm(`Excluir a baseline v${baseline.version} (${BASELINE_STATUS_LABELS[baseline.status]})?`)) return;
    await run("Falha ao excluir a baseline.", () =>
      apiRequest(`/api/v1/projects/${projectId}/baselines/${baseline.id}`, { method: "DELETE" })
    );
  };

  const openCreateCalendar = () => {
    setEditingCalendarId(null);
    setCalendarForm(emptyCalendarForm);
    setError(null);
    setDialog("calendar");
  };

  const openEditCalendar = (calendar: CalendarRow) => {
    setEditingCalendarId(calendar.id);
    setCalendarForm({
      code: calendar.code,
      name: calendar.name,
      scope: calendar.scope,
      week: calendar.workingWeek,
      holidaysText: calendar.holidays.join("\n"),
      isDefault: calendar.isDefault,
    });
    setError(null);
    setDialog("calendar");
  };

  const toggleWeekday = (day: number) =>
    setCalendarForm((previous) => ({
      ...previous,
      week: previous.week.includes(day)
        ? previous.week.filter((value) => value !== day)
        : [...previous.week, day].sort((a, b) => a - b),
    }));

  const submitCalendar = async () => {
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        code: calendarForm.code.trim(),
        name: calendarForm.name.trim(),
        workingWeek: [...calendarForm.week].sort((a, b) => a - b),
        holidays: calendarForm.holidaysText
          .split(/\s+/)
          .map((value) => value.trim())
          .filter(Boolean),
        isDefault: calendarForm.isDefault,
      };
      if (editingCalendarId) {
        await apiRequest(`/api/v1/projects/${projectId}/calendars/${editingCalendarId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest(`/api/v1/projects/${projectId}/calendars`, {
          method: "POST",
          body: JSON.stringify({ ...payload, scope: calendarForm.scope }),
        });
      }
      setDialog(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar calendário.");
    }
  };

  const removeCalendar = async (calendar: CalendarRow) => {
    if (!window.confirm(`Excluir o calendário ${calendar.code} — ${calendar.name}?`)) return;
    await run("Falha ao excluir o calendário.", () =>
      apiRequest(`/api/v1/projects/${projectId}/calendars/${calendar.id}`, { method: "DELETE" })
    );
  };

  // Importação MS Project (E07 import, §27): arquivo CSV/XML ou template salvo;
  // substitui o cronograma atual do projeto (replace-all).
  const openImport = () => {
    setImportMode("file");
    setImportFile(null);
    setImportTemplateId(scheduleTemplates[0]?.id ?? "");
    setImportCalendarId("");
    setError(null);
    setNotice(null);
    setDialog("import");
  };

  const submitImport = async () => {
    setError(null);
    if (importMode === "file" && !importFile) {
      setError("Selecione um arquivo CSV ou XML do MS Project.");
      return;
    }
    if (importMode === "template" && !importTemplateId) {
      setError("Selecione um template de cronograma.");
      return;
    }
    setImportBusy(true);
    try {
      const payload: Record<string, unknown> =
        importMode === "file"
          ? { filename: importFile!.name, content: await importFile!.text() }
          : { templateId: importTemplateId };
      if (importCalendarId) payload.calendarId = importCalendarId;
      const result = await apiRequest<{
        import: {
          activityCount: number;
          dependencyCount: number;
          replacedActivities: number;
          warnings: string[];
          cpm: CpmSummary;
        };
      }>(`/api/v1/projects/${projectId}/schedule/import`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const summary = result.import;
      setNotice(
        `${summary.activityCount} atividades e ${summary.dependencyCount} dependências importadas` +
          (summary.replacedActivities > 0
            ? ` (substituídas ${summary.replacedActivities} existentes)`
            : "") +
          ` · fim previsto ${summary.cpm.projectFinish}` +
          (summary.warnings.length > 0 ? ` · avisos: ${summary.warnings.join(" | ")}` : "")
      );
      setCpm({
        projectFinish: summary.cpm.projectFinish,
        criticalCount: summary.cpm.criticalCount,
        activityCount: summary.cpm.activityCount,
      });
      setDialog(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao importar o cronograma.");
    } finally {
      setImportBusy(false);
    }
  };

  // Aplicar calendário a todas as atividades: recalcula o CPM com o novo
  // calendário e grava as datas do CPM no planejado (E07 import, §27).
  const applyCalendarToAll = async (calendar: CalendarRow) => {
    if (
      !window.confirm(
        `Aplicar o calendário ${calendar.code} — ${calendar.name} a todas as atividades ` +
          "e recalcular início/fim do cronograma?"
      )
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    setApplyBusyId(calendar.id);
    try {
      const result = await apiRequest<{
        calendarApply: { updatedActivities: number; cpm: CpmSummary };
      }>(`/api/v1/projects/${projectId}/schedule/apply-calendar`, {
        method: "POST",
        body: JSON.stringify({ calendarId: calendar.id }),
      });
      const applied = result.calendarApply;
      setNotice(
        `Calendário ${calendar.code} aplicado a ${applied.updatedActivities} atividade(s)` +
          ` · fim previsto ${applied.cpm.projectFinish}`
      );
      setCpm({
        projectFinish: applied.cpm.projectFinish,
        criticalCount: applied.cpm.criticalCount,
        activityCount: applied.cpm.activityCount,
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao aplicar o calendário.");
    } finally {
      setApplyBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {activities.length} atividade{activities.length === 1 ? "" : "s"} ·{" "}
          {dependencies.length} dependência{dependencies.length === 1 ? "" : "s"}
          {cpm && (
            <>
              {" "}
              · fim previsto {cpm.projectFinish} · {cpm.criticalCount} no caminho crítico
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <Button variant="outline" onClick={openImport}>
              <Upload className="h-4 w-4" />
              Importar
            </Button>
          )}
          <Button variant="outline" onClick={() => void recalculate()} disabled={cpmBusy}>
            <Route className="h-4 w-4" />
            {cpmBusy ? "Recalculando…" : "Recalcular CPM"}
          </Button>
          {canCreate && (
            <Button variant="outline" onClick={() => { setDependencyForm(emptyDependencyForm); setError(null); setDialog("dependency"); }}>
              <Plus className="h-4 w-4" />
              Dependência
            </Button>
          )}
          {canCreate && (
            <Button variant="outline" onClick={openCreateCalendar}>
              <Plus className="h-4 w-4" />
              Calendário
            </Button>
          )}
          {canCreate && (
            <Button variant="outline" onClick={() => { setBaselineReason(""); setError(null); setDialog("baseline"); }}>
              <BookmarkPlus className="h-4 w-4" />
              Nova baseline
            </Button>
          )}
          {canCreate && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Nova atividade
            </Button>
          )}
        </div>
      </div>

      <ErrorBox message={error} />
      {notice && (
        <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted-foreground">
          {notice}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="px-4 py-2.5">Código</th>
              <th className="px-4 py-2.5">Nome</th>
              <th className="px-4 py-2.5">Tipo</th>
              <th className="px-4 py-2.5">Duração</th>
              <th className="px-4 py-2.5">Início</th>
              <th className="px-4 py-2.5">Fim</th>
              <th className="px-4 py-2.5">Prev. início</th>
              <th className="px-4 py-2.5">Prev. fim</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Avanço</th>
              <th className="px-4 py-2.5">Float</th>
              <th className="px-4 py-2.5">Caminho</th>
              {(canEdit || canDelete) && <th className="px-4 py-2.5" />}
            </tr>
          </thead>
          <tbody>
            {activities.length === 0 && (
              <tr>
                <td colSpan={13} className="px-4 py-6 text-center text-muted-foreground">
                  Nenhuma atividade ainda. Crie a primeira para começar o cronograma.
                </td>
              </tr>
            )}
            {activities.map((activity) => (
              <tr key={activity.id} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-2.5 font-mono text-xs">{activity.code}</td>
                <td className="px-4 py-2.5">
                  <span>{activity.name}</span>
                  {activity.wbsNodeCode && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      WBS {activity.wbsNodeCode}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">{TYPE_LABELS[activity.activityType]}</td>
                <td className="px-4 py-2.5">
                  {activity.duration === 0 ? "0 d (marco)" : `${activity.duration} d`}
                </td>
                <td className="px-4 py-2.5">{activity.plannedStart ?? "—"}</td>
                <td className="px-4 py-2.5">{activity.plannedFinish ?? "—"}</td>
                <td className="px-4 py-2.5">{activity.forecastStart ?? "—"}</td>
                <td className="px-4 py-2.5">{activity.forecastFinish ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <Badge variant={STATUS_VARIANT[activity.status]}>
                    {STATUS_LABELS[activity.status]}
                  </Badge>
                </td>
                <td className="px-4 py-2.5">{activity.physicalProgress}%</td>
                <td className="px-4 py-2.5">
                  {activity.totalFloat === null ? "—" : `${activity.totalFloat} d`}
                </td>
                <td className="px-4 py-2.5">
                  {activity.critical ? (
                    <Badge variant="destructive">Crítico</Badge>
                  ) : (
                    <Badge variant="secondary">Normal</Badge>
                  )}
                </td>
                {(canEdit || canDelete) && (
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      {canEdit && (
                        <button
                          type="button"
                          aria-label={`Editar ${activity.code}`}
                          onClick={() => openEdit(activity)}
                          className="rounded p-1 text-muted-foreground hover:bg-surface-hover"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          aria-label={`Excluir ${activity.code}`}
                          onClick={() => void removeActivity(activity)}
                          className="rounded p-1 text-muted-foreground hover:bg-surface-hover"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dependencies.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-2.5">Predecessora</th>
                <th className="px-4 py-2.5">Sucessora</th>
                <th className="px-4 py-2.5">Tipo</th>
                <th className="px-4 py-2.5">Lag/lead</th>
                {canDelete && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {dependencies.map((dependency) => (
                <tr key={dependency.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs">{dependency.predecessorCode}</span>{" "}
                    {dependency.predecessorName}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs">{dependency.successorCode}</span>{" "}
                    {dependency.successorName}
                  </td>
                  <td className="px-4 py-2.5">{DEPENDENCY_LABELS[dependency.type]}</td>
                  <td className="px-4 py-2.5">
                    {dependency.lag === 0 ? "—" : `${dependency.lag} d`}
                  </td>
                  {canDelete && (
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        aria-label="Remover dependência"
                        onClick={() => void removeDependency(dependency)}
                        className="rounded p-1 text-muted-foreground hover:bg-surface-hover"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Calendários (E07-US03, §27)</h2>
          <p className="text-xs text-muted-foreground">
            Semana útil e feriados; o padrão vale para as atividades sem calendário próprio.
          </p>
        </div>
        {calendars.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum calendário — o padrão é segunda a sexta, sem feriados.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2.5">Código</th>
                  <th className="px-4 py-2.5">Nome</th>
                  <th className="px-4 py-2.5">Escopo</th>
                  <th className="px-4 py-2.5">Semana útil</th>
                  <th className="px-4 py-2.5">Feriados</th>
                  <th className="px-4 py-2.5">Padrão</th>
                  {canEdit && <th className="px-4 py-2.5">Cronograma</th>}
                  {(canEdit || canDelete) && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {calendars.map((calendar) => (
                  <tr key={calendar.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs">{calendar.code}</td>
                    <td className="px-4 py-2.5">{calendar.name}</td>
                    <td className="px-4 py-2.5">{calendar.scope === "PROJECT" ? "Projeto" : "Organização"}</td>
                    <td className="px-4 py-2.5 text-xs">
                      {calendar.workingWeek.map((day) => WEEKDAY_LABELS[day]).join(" ")}
                    </td>
                    <td className="px-4 py-2.5">{calendar.holidays.length}</td>
                    <td className="px-4 py-2.5">
                      {calendar.isDefault ? <Badge variant="success">Padrão</Badge> : "—"}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={applyBusyId === calendar.id}
                          onClick={() => void applyCalendarToAll(calendar)}
                        >
                          <CalendarCheck className="h-4 w-4" />
                          {applyBusyId === calendar.id ? "Aplicando…" : "Aplicar ao cronograma"}
                        </Button>
                      </td>
                    )}
                    {(canEdit || canDelete) && (
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          {canEdit && (
                            <button
                              type="button"
                              aria-label={`Editar calendário ${calendar.code}`}
                              onClick={() => openEditCalendar(calendar)}
                              className="rounded p-1 text-muted-foreground hover:bg-surface-hover"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              aria-label={`Excluir calendário ${calendar.code}`}
                              onClick={() => void removeCalendar(calendar)}
                              className="rounded p-1 text-muted-foreground hover:bg-surface-hover"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Baselines (E07-US04, §28)</h2>
          <p className="text-xs text-muted-foreground">
            Aprovada é imutável — alteração exige ChangeRequest (E11).
          </p>
        </div>
        {baselines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma baseline ainda. Crie um snapshot do cronograma para poder
            comparar o planejado com o executado.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2.5">Versão</th>
                  <th className="px-4 py-2.5">Tipo</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Captura</th>
                  <th className="px-4 py-2.5">Atividades</th>
                  <th className="px-4 py-2.5">Motivo</th>
                  {(canEdit || canDelete || canApprove) && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {baselines.map((baseline) => (
                  <tr key={baseline.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs">v{baseline.version}</td>
                    <td className="px-4 py-2.5">{baseline.type}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={BASELINE_STATUS_VARIANT[baseline.status]}>
                        {BASELINE_STATUS_LABELS[baseline.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">{baseline.capturedAt ? baseline.capturedAt.slice(0, 10) : "—"}</td>
                    <td className="px-4 py-2.5">{baseline.activityCount}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{baseline.reason ?? "—"}</td>
                    {(canEdit || canDelete || canApprove) && (
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          {canEdit && (baseline.status === "DRAFT") && (
                            <button
                              type="button"
                              aria-label={`Submeter baseline v${baseline.version}`}
                              onClick={() => void baselineAction(baseline, "SUBMIT")}
                              className="rounded p-1 text-muted-foreground hover:bg-surface-hover"
                              title="Submeter para aprovação"
                            >
                              <Send className="h-4 w-4" />
                            </button>
                          )}
                          {canApprove && (baseline.status === "DRAFT" || baseline.status === "SUBMITTED") && (
                            <button
                              type="button"
                              aria-label={`Aprovar baseline v${baseline.version}`}
                              onClick={() => void baselineAction(baseline, "APPROVE")}
                              className="rounded p-1 text-muted-foreground hover:bg-surface-hover"
                              title="Aprovar (imutável)"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                          )}
                          {canEdit && baseline.status === "SUBMITTED" && (
                            <button
                              type="button"
                              aria-label={`Rejeitar baseline v${baseline.version}`}
                              onClick={() => void baselineAction(baseline, "REJECT")}
                              className="rounded p-1 text-muted-foreground hover:bg-surface-hover"
                              title="Rejeitar (voltar para rascunho)"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                          {canDelete && (baseline.status === "DRAFT" || baseline.status === "SUBMITTED") && (
                            <button
                              type="button"
                              aria-label={`Excluir baseline v${baseline.version}`}
                              onClick={() => void removeBaseline(baseline)}
                              className="rounded p-1 text-muted-foreground hover:bg-surface-hover"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog
        open={dialog === "activity"}
        title={editingId ? "Editar atividade" : "Nova atividade"}
        onClose={() => setDialog(null)}
      >
        <div className="grid gap-3">
          <ErrorBox message={error} />
          <div className="grid gap-1.5">
            <Label htmlFor="act-name">Nome</Label>
            <Input id="act-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="act-code">Código (opcional)</Label>
              <Input
                id="act-code"
                value={form.code}
                onChange={(e) => set("code", e.target.value)}
                placeholder="A001"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="act-type">Tipo</Label>
              <select
                id="act-type"
                value={form.activityType}
                onChange={(e) => {
                  set("activityType", e.target.value);
                  if (e.target.value === "MILESTONE") set("duration", "0");
                }}
                className={selectClass}
              >
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="act-duration">Duração (dias)</Label>
              <Input
                id="act-duration"
                type="number"
                min={0}
                value={form.duration}
                onChange={(e) => set("duration", e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="act-start">Início planejado</Label>
              <Input
                id="act-start"
                type="date"
                value={form.plannedStart}
                onChange={(e) => set("plannedStart", e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="act-finish">Fim planejado</Label>
              <Input
                id="act-finish"
                type="date"
                value={form.plannedFinish}
                onChange={(e) => set("plannedFinish", e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="act-wbs">WBS</Label>
              <select
                id="act-wbs"
                value={form.wbsNodeId}
                onChange={(e) => set("wbsNodeId", e.target.value)}
                className={selectClass}
              >
                <option value="">— Sem vínculo —</option>
                {wbsNodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.code} — {node.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="act-status">Status</Label>
              <select
                id="act-status"
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className={selectClass}
              >
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="act-calendar">Calendário</Label>
            <select
              id="act-calendar"
              value={form.calendarId}
              onChange={(e) => set("calendarId", e.target.value)}
              className={selectClass}
            >
              <option value="">— Padrão (seg–sex) —</option>
              {calendars.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>
                  {calendar.code} — {calendar.name}
                  {calendar.isDefault ? " (padrão)" : ""}
                </option>
              ))}
            </select>
          </div>
          {editingId && (
            <div className="grid gap-1.5">
              <Label htmlFor="act-progress">Avanço físico (%)</Label>
              <Input
                id="act-progress"
                type="number"
                min={0}
                max={100}
                value={form.physicalProgress}
                onChange={(e) => set("physicalProgress", e.target.value)}
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void submitActivity()}>Salvar</Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={dialog === "dependency"}
        title="Nova dependência"
        onClose={() => setDialog(null)}
      >
        <div className="grid gap-3">
          <ErrorBox message={error} />
          <div className="grid gap-1.5">
            <Label htmlFor="dep-predecessor">Predecessora</Label>
            <select
              id="dep-predecessor"
              value={dependencyForm.predecessorId}
              onChange={(e) => setDependency("predecessorId", e.target.value)}
              className={selectClass}
            >
              <option value="">— Selecionar —</option>
              {activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.code} — {activity.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="dep-successor">Sucessora</Label>
            <select
              id="dep-successor"
              value={dependencyForm.successorId}
              onChange={(e) => setDependency("successorId", e.target.value)}
              className={selectClass}
            >
              <option value="">— Selecionar —</option>
              {activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.code} — {activity.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="dep-type">Tipo</Label>
              <select
                id="dep-type"
                value={dependencyForm.type}
                onChange={(e) => setDependency("type", e.target.value)}
                className={selectClass}
              >
                {Object.entries(DEPENDENCY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {value} — {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="dep-lag">Lag/lead (dias)</Label>
              <Input
                id="dep-lag"
                type="number"
                value={dependencyForm.lag}
                onChange={(e) => setDependency("lag", e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void submitDependency()}>Criar</Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={dialog === "baseline"}
        title="Nova baseline do cronograma"
        onClose={() => setDialog(null)}
      >
        <div className="grid gap-3">
          <ErrorBox message={error} />
          <p className="text-sm text-muted-foreground">
            Captura as {activities.length} atividade{activities.length === 1 ? "" : "s"} e as{" "}
            {dependencies.length} dependência{dependencies.length === 1 ? "" : "s"} atuais em um
            snapshot imutável (v{((baselines.find((b) => b.type === "SCHEDULE")?.version ?? 0) + 1)}).
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor="bl-reason">Motivo (opcional)</Label>
            <Input
              id="bl-reason"
              value={baselineReason}
              onChange={(e) => setBaselineReason(e.target.value)}
              placeholder="Ex.: baseline contratual após aprovação do G4"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void createBaseline()}>Criar baseline</Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={dialog === "calendar"}
        title={editingCalendarId ? "Editar calendário" : "Novo calendário"}
        onClose={() => setDialog(null)}
      >
        <div className="grid gap-3">
          <ErrorBox message={error} />
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cal-code">Código</Label>
              <Input
                id="cal-code"
                value={calendarForm.code}
                onChange={(e) => setCalendarForm((p) => ({ ...p, code: e.target.value }))}
                placeholder="CAL-5D"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cal-name">Nome</Label>
              <Input
                id="cal-name"
                value={calendarForm.name}
                onChange={(e) => setCalendarForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
          </div>
          {!editingCalendarId && (
            <div className="grid gap-1.5">
              <Label htmlFor="cal-scope">Escopo</Label>
              <select
                id="cal-scope"
                value={calendarForm.scope}
                onChange={(e) =>
                  setCalendarForm((p) => ({ ...p, scope: e.target.value as CalendarForm["scope"] }))
                }
                className={selectClass}
              >
                <option value="PROJECT">Projeto — só este projeto</option>
                <option value="ORGANIZATION">Organização — todos os projetos</option>
              </select>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label>Semana útil</Label>
            <div className="flex flex-wrap gap-3">
              {WEEKDAY_LABELS.map((label, day) => (
                <label key={day} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={calendarForm.week.includes(day)}
                    onChange={() => toggleWeekday(day)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cal-holidays">Feriados (AAAA-MM-DD, um por linha)</Label>
            <textarea
              id="cal-holidays"
              value={calendarForm.holidaysText}
              onChange={(e) => setCalendarForm((p) => ({ ...p, holidaysText: e.target.value }))}
              rows={3}
              className="rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-sm"
              placeholder="2026-01-01&#10;2026-04-21"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={calendarForm.isDefault}
              onChange={(e) => setCalendarForm((p) => ({ ...p, isDefault: e.target.checked }))}
            />
            Usar como calendário padrão do escopo
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void submitCalendar()}>Salvar</Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={dialog === "import"}
        title="Importar cronograma (MS Project)"
        onClose={() => setDialog(null)}
      >
        <div className="grid gap-3">
          <ErrorBox message={error} />
          <p className="text-sm text-muted-foreground">
            Substitui o cronograma atual ({activities.length} atividade
            {activities.length === 1 ? "" : "s"}, {dependencies.length} dependência
            {dependencies.length === 1 ? "" : "s"}) pelo arquivo CSV/XML do MS Project ou por um
            template salvo. Baselines e WBS existentes são preservados.
          </p>
          <div className="flex gap-2">
            <Button
              variant={importMode === "file" ? "default" : "outline"}
              size="sm"
              onClick={() => setImportMode("file")}
            >
              Arquivo CSV/XML
            </Button>
            <Button
              variant={importMode === "template" ? "default" : "outline"}
              size="sm"
              disabled={scheduleTemplates.length === 0}
              onClick={() => setImportMode("template")}
            >
              Template salvo
            </Button>
          </div>
          {importMode === "file" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="imp-file">Arquivo (.csv ou .xml)</Label>
              <input
                id="imp-file"
                type="file"
                accept=".csv,.xml,text/csv,application/xml,text/xml"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                className="text-sm"
              />
              {importFile && (
                <p className="text-xs text-muted-foreground">{importFile.name}</p>
              )}
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="imp-template">Template de cronograma</Label>
              <select
                id="imp-template"
                value={importTemplateId}
                onChange={(e) => setImportTemplateId(e.target.value)}
                className={selectClass}
              >
                <option value="">Selecione…</option>
                {scheduleTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.code} — {template.name} ({template.activityCount} atividades,{" "}
                    {template.dependencyCount} dependências)
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="imp-calendar">Calendário (opcional — vincula a todas as atividades)</Label>
            <select
              id="imp-calendar"
              value={importCalendarId}
              onChange={(e) => setImportCalendarId(e.target.value)}
              className={selectClass}
            >
              <option value="">Nenhum — manter sem calendário</option>
              {calendars.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>
                  {calendar.code} — {calendar.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void submitImport()} disabled={importBusy}>
              {importBusy ? "Importando…" : "Importar e substituir"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
