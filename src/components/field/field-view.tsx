"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, ArrowRightLeft, Camera } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import {
  CONSTRAINT_ACTION_LABELS_PT,
  CONSTRAINT_TYPE_LABELS_PT,
  CONSTRAINT_TYPES,
  DIARY_ACTION_LABELS_PT,
  DIARY_STATUS_LABELS_PT,
  FIELD_PRIORITIES,
  FIELD_PRIORITY_LABELS_PT,
  TASK_ACTION_LABELS_PT,
  TASK_STATUS_LABELS_PT,
  availableConstraintActions,
  availableDiaryActions,
  availableTaskActions,
  type ConstraintStatus,
  type ConstraintType,
  type DiaryStatus,
  type FieldBoardCounts,
  type TaskStatus,
} from "@/modules/field/engine";
import type { ConstraintRow, DiaryRow, PhotoRow, TaskRow } from "@/modules/field/selectors";

// Campo (E12, §38) — mobile-first: poucos campos, home do dia
// (Hoje/Esta semana/Atrasadas/Restrições) e quatro blocos operacionais.

interface OptionLite {
  id: string;
  label: string;
}

interface Props {
  projectId: string;
  initialDiaries: DiaryRow[];
  initialTasks: TaskRow[];
  initialConstraints: ConstraintRow[];
  initialPhotos: PhotoRow[];
  board: FieldBoardCounts;
  members: OptionLite[];
  wbsNodes: OptionLite[];
  activities: OptionLite[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canReject: boolean;
}

type Tab = "diarios" | "tarefas" | "restricoes" | "fotos";

const TASK_STATUS_VARIANT: Record<TaskStatus, "secondary" | "default" | "warning" | "destructive"> =
  {
    OPEN: "secondary",
    IN_PROGRESS: "default",
    BLOCKED: "destructive",
    DONE: "secondary",
    CANCELLED: "secondary",
  };

const DIARY_STATUS_VARIANT: Record<
  DiaryStatus,
  "secondary" | "default" | "warning" | "destructive"
> = {
  DRAFT: "secondary",
  SUBMITTED: "default",
  APPROVED: "secondary",
  REJECTED: "destructive",
  CANCELLED: "secondary",
};

const CONSTRAINT_STATUS_VARIANT: Record<
  ConstraintStatus,
  "secondary" | "default" | "warning" | "destructive"
> = {
  OPEN: "warning",
  ADDRESSED: "default",
  REMOVED: "secondary",
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

const emptyDiaryForm = {
  code: "",
  entryDate: "",
  team: "",
  workHours: "",
  activities: "",
  progressNotes: "",
  occurrences: "",
  conditions: "",
  safety: "",
};

const emptyTaskForm = {
  code: "",
  title: "",
  description: "",
  priority: "MEDIUM",
  assigneeId: "",
  dueDate: "",
  wbsNodeId: "",
  activityId: "",
  diaryId: "",
};

const emptyConstraintForm = {
  code: "",
  title: "",
  description: "",
  type: "EXTERNAL",
  priority: "MEDIUM",
  ownerId: "",
  dueDate: "",
  wbsNodeId: "",
  activityId: "",
};

function cleanPayload<T extends Record<string, unknown>>(form: T) {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(form)) {
    payload[key] = value === "" ? undefined : value;
  }
  return payload;
}

export function FieldView({
  projectId,
  initialDiaries,
  initialTasks,
  initialConstraints,
  initialPhotos,
  board,
  members,
  wbsNodes,
  activities,
  canCreate,
  canEdit,
  canDelete,
  canApprove,
  canReject,
}: Props) {
  const router = useRouter();
  const diaryBase = `/api/v1/projects/${projectId}/field/diaries`;
  const taskBase = `/api/v1/projects/${projectId}/field/tasks`;
  const constraintBase = `/api/v1/projects/${projectId}/field/constraints`;
  const photoBase = `/api/v1/projects/${projectId}/field/photos`;

  const [tab, setTab] = useState<Tab>("diarios");
  const [diaries, setDiaries] = useState<DiaryRow[]>(initialDiaries);
  const [tasks, setTasks] = useState<TaskRow[]>(initialTasks);
  const [constraints, setConstraints] = useState<ConstraintRow[]>(initialConstraints);
  const [photos, setPhotos] = useState<PhotoRow[]>(initialPhotos);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [diaryDialog, setDiaryDialog] = useState(false);
  const [editingDiaryId, setEditingDiaryId] = useState<string | null>(null);
  const [diaryForm, setDiaryForm] = useState(emptyDiaryForm);

  const [taskDialog, setTaskDialog] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);

  const [constraintDialog, setConstraintDialog] = useState(false);
  const [editingConstraintId, setEditingConstraintId] = useState<string | null>(null);
  const [constraintForm, setConstraintForm] = useState(emptyConstraintForm);

  const [transition, setTransition] = useState<{
    kind: "diary" | "task" | "constraint";
    id: string;
    code: string;
    action: string;
    reason: string;
    resolution: string;
    allowed: string[];
    actionLabels: Record<string, string>;
  } | null>(null);

  const [photoDialog, setPhotoDialog] = useState(false);
  const [photoCaption, setPhotoCaption] = useState("");
  const [photoDiaryId, setPhotoDiaryId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAll = async () => {
    try {
      const [d, t, c, p] = await Promise.all([
        apiRequest<{ diaries: DiaryRow[] }>(diaryBase),
        apiRequest<{ tasks: TaskRow[] }>(taskBase),
        apiRequest<{ constraints: ConstraintRow[] }>(constraintBase),
        apiRequest<{ photos: PhotoRow[] }>(photoBase),
      ]);
      setDiaries(d.diaries);
      setTasks(t.tasks);
      setConstraints(c.constraints);
      setPhotos(p.photos);
      setError(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao carregar os dados de campo.");
    }
  };

  // --- Diário -------------------------------------------------------------
  const setDiaryField = (key: keyof typeof diaryForm, value: string) =>
    setDiaryForm((previous) => ({ ...previous, [key]: value }));

  const openDiaryCreate = () => {
    setEditingDiaryId(null);
    setDiaryForm({ ...emptyDiaryForm, entryDate: new Date().toISOString().slice(0, 10) });
    setError(null);
    setDiaryDialog(true);
  };

  const openDiaryEdit = (diary: DiaryRow) => {
    setEditingDiaryId(diary.id);
    setDiaryForm({
      code: diary.code,
      entryDate: diary.entryDate,
      team: diary.team ?? "",
      workHours: diary.workHours === null ? "" : String(diary.workHours),
      activities: diary.activities ?? "",
      progressNotes: diary.progressNotes ?? "",
      occurrences: diary.occurrences ?? "",
      conditions: diary.conditions ?? "",
      safety: diary.safety ?? "",
    });
    setError(null);
    setDiaryDialog(true);
  };

  const submitDiary = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = cleanPayload({ ...diaryForm, workHours: diaryForm.workHours });
      await apiRequest(editingDiaryId ? `${diaryBase}/${editingDiaryId}` : diaryBase, {
        method: editingDiaryId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setDiaryDialog(false);
      await loadAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar o diário.");
    } finally {
      setBusy(false);
    }
  };

  const removeDiary = async (diary: DiaryRow) => {
    if (!window.confirm(`Excluir o diário ${diary.code}?`)) return;
    try {
      await apiRequest(`${diaryBase}/${diary.id}`, { method: "DELETE" });
      await loadAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao excluir o diário.");
    }
  };

  // --- Tarefa -------------------------------------------------------------
  const setTaskField = (key: keyof typeof taskForm, value: string) =>
    setTaskForm((previous) => ({ ...previous, [key]: value }));

  const openTaskCreate = () => {
    setEditingTaskId(null);
    setTaskForm(emptyTaskForm);
    setError(null);
    setTaskDialog(true);
  };

  const openTaskEdit = (task: TaskRow) => {
    setEditingTaskId(task.id);
    setTaskForm({
      code: task.code,
      title: task.title,
      description: task.description ?? "",
      priority: task.priority,
      assigneeId: task.assigneeId ?? "",
      dueDate: task.dueDate ?? "",
      wbsNodeId: task.wbsNodeId ?? "",
      activityId: task.activityId ?? "",
      diaryId: task.diaryId ?? "",
    });
    setError(null);
    setTaskDialog(true);
  };

  const submitTask = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = cleanPayload(taskForm);
      await apiRequest(editingTaskId ? `${taskBase}/${editingTaskId}` : taskBase, {
        method: editingTaskId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setTaskDialog(false);
      await loadAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar a tarefa.");
    } finally {
      setBusy(false);
    }
  };

  const removeTask = async (task: TaskRow) => {
    if (!window.confirm(`Excluir a tarefa ${task.code}?`)) return;
    try {
      await apiRequest(`${taskBase}/${task.id}`, { method: "DELETE" });
      await loadAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao excluir a tarefa.");
    }
  };

  // --- Restrição ----------------------------------------------------------
  const setConstraintField = (key: keyof typeof constraintForm, value: string) =>
    setConstraintForm((previous) => ({ ...previous, [key]: value }));

  const openConstraintCreate = () => {
    setEditingConstraintId(null);
    setConstraintForm(emptyConstraintForm);
    setError(null);
    setConstraintDialog(true);
  };

  const openConstraintEdit = (constraint: ConstraintRow) => {
    setEditingConstraintId(constraint.id);
    setConstraintForm({
      code: constraint.code,
      title: constraint.title,
      description: constraint.description ?? "",
      type: constraint.type,
      priority: constraint.priority,
      ownerId: constraint.ownerId ?? "",
      dueDate: constraint.dueDate ?? "",
      wbsNodeId: constraint.wbsNodeId ?? "",
      activityId: constraint.activityId ?? "",
    });
    setError(null);
    setConstraintDialog(true);
  };

  const submitConstraint = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = cleanPayload(constraintForm);
      await apiRequest(
        editingConstraintId ? `${constraintBase}/${editingConstraintId}` : constraintBase,
        { method: editingConstraintId ? "PATCH" : "POST", body: JSON.stringify(payload) }
      );
      setConstraintDialog(false);
      await loadAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar a restrição.");
    } finally {
      setBusy(false);
    }
  };

  const removeConstraint = async (constraint: ConstraintRow) => {
    if (!window.confirm(`Excluir a restrição ${constraint.code}?`)) return;
    try {
      await apiRequest(`${constraintBase}/${constraint.id}`, { method: "DELETE" });
      await loadAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao excluir a restrição.");
    }
  };

  // --- Transições ---------------------------------------------------------
  const openTransition = (
    kind: "diary" | "task" | "constraint",
    id: string,
    code: string,
    allowed: string[],
    actionLabels: Record<string, string>
  ) => {
    const visible =
      kind === "diary"
        ? allowed.filter(
            (action) =>
              (action !== "APPROVE" || canApprove) && (action !== "REJECT" || canReject)
          )
        : allowed;
    setTransition({
      kind,
      id,
      code,
      action: "",
      reason: "",
      resolution: "",
      allowed: visible,
      actionLabels,
    });
    setError(null);
  };

  const submitTransition = async () => {
    if (!transition || !transition.action) return;
    setBusy(true);
    setError(null);
    try {
      const base =
        transition.kind === "diary" ? diaryBase : transition.kind === "task" ? taskBase : constraintBase;
      await apiRequest(`${base}/${transition.id}/status`, {
        method: "POST",
        body: JSON.stringify({
          action: transition.action,
          reason: transition.reason || undefined,
          resolution: transition.resolution || undefined,
        }),
      });
      setTransition(null);
      await loadAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha na transição de status.");
    } finally {
      setBusy(false);
    }
  };

  // --- Fotos --------------------------------------------------------------
  const submitPhoto = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (photoCaption) form.append("caption", photoCaption);
      if (photoDiaryId) form.append("diaryId", photoDiaryId);
      const response = await fetch(photoBase, { method: "POST", body: form });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Falha ao enviar a foto.");
      }
      setPhotoDialog(false);
      setPhotoCaption("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao enviar a foto.");
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = async (photo: PhotoRow) => {
    if (!window.confirm(`Excluir a foto ${photo.code}?`)) return;
    try {
      await apiRequest(`${photoBase}/${photo.id}`, { method: "DELETE" });
      await loadAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao excluir a foto.");
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = (() => {
    const date = new Date();
    date.setDate(date.getDate() + (7 - date.getDay()));
    return date.toISOString().slice(0, 10);
  })();
  const thisWeekDiaries = diaries.filter((d) => d.entryDate >= today && d.entryDate <= weekEnd);
  const pendingTasks = tasks.filter((task) => task.status !== "DONE" && task.status !== "CANCELLED");

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "diarios", label: "Diários", count: diaries.length },
    { id: "tarefas", label: "Tarefas", count: pendingTasks.length },
    { id: "restricoes", label: "Restrições", count: constraints.filter((c) => c.isOpen).length },
    { id: "fotos", label: "Fotos", count: photos.length },
  ];

  return (
    <div className="flex flex-col gap-6">
      <ErrorBox message={error} />

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Resumo de campo</h2>
          <span className="text-xs text-muted-foreground">Hoje · semana · atrasos · §38</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Hoje", value: board.today },
            { label: "Esta semana", value: board.thisWeek },
            { label: "Tarefas atrasadas", value: board.overdue },
            { label: "Restrições abertas", value: board.openConstraints },
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

        {tab === "fotos" && canCreate && (
          <Button onClick={() => setPhotoDialog(true)}>
            <Camera className="h-4 w-4" />
            Enviar foto
          </Button>
        )}
      </div>

      {tab === "diarios" && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Diários de obra (§26)</h2>
              <p className="text-xs text-muted-foreground">
                Semana: {thisWeekDiaries.length} · aprovados:{" "}
                {diaries.filter((d) => d.status === "APPROVED").length}
              </p>
            </div>
            {canCreate && (
              <Button onClick={openDiaryCreate}>
                <Plus className="h-4 w-4" />
                Novo diário
              </Button>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2.5">Código</th>
                  <th className="px-4 py-2.5">Data</th>
                  <th className="px-4 py-2.5">Equipe</th>
                  <th className="px-4 py-2.5 text-center">Fotos</th>
                  <th className="px-4 py-2.5">Status</th>
                  {(canEdit || canDelete) && <th className="px-4 py-2.5 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {diaries.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <Empty text="Nenhum diário registrado." />
                    </td>
                  </tr>
                )}
                {diaries.map((diary) => {
                  const actions = availableDiaryActions(diary.status);
                  return (
                    <tr key={diary.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs">{diary.code}</td>
                      <td className="px-4 py-2.5">{diary.entryDate}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{diary.team ?? "—"}</td>
                      <td className="px-4 py-2.5 text-center">{diary.photoCount}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant={DIARY_STATUS_VARIANT[diary.status]}>
                          {DIARY_STATUS_LABELS_PT[diary.status]}
                        </Badge>
                      </td>
                      {(canEdit || canDelete) && (
                        <td className="px-4 py-2.5">
                          <div className="flex justify-end gap-1">
                            {actions.length > 0 && canEdit && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Transição de status"
                                onClick={() =>
                                  openTransition(
                                    "diary",
                                    diary.id,
                                    diary.code,
                                    actions,
                                    DIARY_ACTION_LABELS_PT
                                  )
                                }
                              >
                                <ArrowRightLeft className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canEdit && diary.isOpen && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Editar diário"
                                onClick={() => openDiaryEdit(diary)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canDelete && diary.isOpen && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Excluir diário"
                                onClick={() => void removeDiary(diary)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "tarefas" && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Tarefas de campo</h2>
            {canCreate && (
              <Button onClick={openTaskCreate}>
                <Plus className="h-4 w-4" />
                Nova tarefa
              </Button>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2.5">Código</th>
                  <th className="px-4 py-2.5">Tarefa</th>
                  <th className="px-4 py-2.5">Prioridade</th>
                  <th className="px-4 py-2.5">Responsável</th>
                  <th className="px-4 py-2.5">Prazo</th>
                  <th className="px-4 py-2.5">Status</th>
                  {(canEdit || canDelete) && <th className="px-4 py-2.5 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {tasks.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <Empty text="Nenhuma tarefa cadastrada." />
                    </td>
                  </tr>
                )}
                {tasks.map((task) => (
                  <tr key={task.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs">{task.code}</td>
                    <td className="px-4 py-2.5">{task.title}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {FIELD_PRIORITY_LABELS_PT[task.priority]}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{task.assigneeName ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {task.dueDate ?? "—"}
                      {task.isOverdue && (
                        <span className="ml-1 text-xs font-medium text-destructive">atrasada</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={TASK_STATUS_VARIANT[task.status]}>
                        {TASK_STATUS_LABELS_PT[task.status]}
                      </Badge>
                    </td>
                    {(canEdit || canDelete) && (
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Transição de status"
                              onClick={() =>
                                openTransition(
                                  "task",
                                  task.id,
                                  task.code,
                                  availableTaskActions(task.status),
                                  TASK_ACTION_LABELS_PT
                                )
                              }
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canEdit && task.isOpen && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Editar tarefa"
                              onClick={() => openTaskEdit(task)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canDelete && task.isOpen && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Excluir tarefa"
                              onClick={() => void removeTask(task)}
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

      {tab === "restricoes" && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Restrições (§39)</h2>
              <p className="text-xs text-muted-foreground">
                Identificação → endereçamento → remoção
              </p>
            </div>
            {canCreate && (
              <Button onClick={openConstraintCreate}>
                <Plus className="h-4 w-4" />
                Nova restrição
              </Button>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2.5">Código</th>
                  <th className="px-4 py-2.5">Restrição</th>
                  <th className="px-4 py-2.5">Tipo</th>
                  <th className="px-4 py-2.5">Responsável</th>
                  <th className="px-4 py-2.5">Prazo</th>
                  <th className="px-4 py-2.5">Status</th>
                  {(canEdit || canDelete) && <th className="px-4 py-2.5 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {constraints.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <Empty text="Nenhuma restrição registrada." />
                    </td>
                  </tr>
                )}
                {constraints.map((constraint) => (
                  <tr key={constraint.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs">{constraint.code}</td>
                    <td className="px-4 py-2.5">{constraint.title}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {CONSTRAINT_TYPE_LABELS_PT[constraint.type]}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {constraint.ownerName ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {constraint.dueDate ?? "—"}
                      {constraint.isOverdue && (
                        <span className="ml-1 text-xs font-medium text-destructive">atrasada</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={CONSTRAINT_STATUS_VARIANT[constraint.status]}>
                        {DIARY_STATUS_LABELS_PT[constraint.status as DiaryStatus] ??
                          constraint.status}
                      </Badge>
                    </td>
                    {(canEdit || canDelete) && (
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Transição de status"
                              onClick={() =>
                                openTransition(
                                  "constraint",
                                  constraint.id,
                                  constraint.code,
                                  availableConstraintActions(constraint.status),
                                  CONSTRAINT_ACTION_LABELS_PT
                                )
                              }
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canEdit && constraint.isOpen && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Editar restrição"
                              onClick={() => openConstraintEdit(constraint)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canDelete && constraint.isOpen && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Excluir restrição"
                              onClick={() => void removeConstraint(constraint)}
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

      {tab === "fotos" && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Fotos de evidência</h2>
          {photos.length === 0 && <Empty text="Nenhuma foto enviada." />}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/v1/projects/${projectId}/field/photos/${photo.id}`}
                  alt={photo.caption ?? photo.code}
                  className="h-32 w-full rounded-md border border-border bg-background object-cover"
                  loading="lazy"
                />
                <div className="text-xs">
                  <div className="font-mono">{photo.code}</div>
                  <div className="line-clamp-2 text-muted-foreground">
                    {photo.caption ?? photo.fileName}
                  </div>
                  <div className="text-muted-foreground">
                    {photo.diaryCode ? `Diário ${photo.diaryCode} · ` : ""}
                    {photo.createdAt.slice(0, 10)}
                  </div>
                </div>
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start"
                    onClick={() => void removePhoto(photo)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Excluir
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Diário (criação/edição) */}
      <Dialog
        open={diaryDialog}
        title={editingDiaryId ? "Editar diário" : "Novo diário de obra"}
        onClose={() => setDiaryDialog(false)}
        wide
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="diary-date">Data da obra *</Label>
            <Input
              id="diary-date"
              type="date"
              value={diaryForm.entryDate}
              onChange={(event) => setDiaryField("entryDate", event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="diary-team">Equipe</Label>
            <Input
              id="diary-team"
              value={diaryForm.team}
              onChange={(event) => setDiaryField("team", event.target.value)}
              placeholder="Ex.: 6 eletricistas"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="diary-hours">Horas trabalhadas</Label>
            <Input
              id="diary-hours"
              type="number"
              min={0}
              value={diaryForm.workHours}
              onChange={(event) => setDiaryField("workHours", event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="diary-conditions">Condições de campo</Label>
            <Input
              id="diary-conditions"
              value={diaryForm.conditions}
              onChange={(event) => setDiaryField("conditions", event.target.value)}
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="diary-activities">Atividades realizadas</Label>
            <textarea
              id="diary-activities"
              value={diaryForm.activities}
              onChange={(event) => setDiaryField("activities", event.target.value)}
              rows={3}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="diary-progress">Avanço e observações</Label>
            <textarea
              id="diary-progress"
              value={diaryForm.progressNotes}
              onChange={(event) => setDiaryField("progressNotes", event.target.value)}
              rows={3}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="diary-occurrences">Ocorrências</Label>
            <textarea
              id="diary-occurrences"
              value={diaryForm.occurrences}
              onChange={(event) => setDiaryField("occurrences", event.target.value)}
              rows={2}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="diary-safety">Segurança</Label>
            <textarea
              id="diary-safety"
              value={diaryForm.safety}
              onChange={(event) => setDiaryField("safety", event.target.value)}
              rows={2}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDiaryDialog(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void submitDiary()} disabled={busy || !diaryForm.entryDate}>
            {busy ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </Dialog>

      {/* Tarefa */}
      <Dialog
        open={taskDialog}
        title={editingTaskId ? "Editar tarefa" : "Nova tarefa de campo"}
        onClose={() => setTaskDialog(false)}
        wide
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="task-title">Título *</Label>
            <Input
              id="task-title"
              value={taskForm.title}
              onChange={(event) => setTaskField("title", event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="task-priority">Prioridade</Label>
            <select
              id="task-priority"
              value={taskForm.priority}
              onChange={(event) => setTaskField("priority", event.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              {FIELD_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {FIELD_PRIORITY_LABELS_PT[priority]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="task-assignee">Responsável</Label>
            <select
              id="task-assignee"
              value={taskForm.assigneeId}
              onChange={(event) => setTaskField("assigneeId", event.target.value)}
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
            <Label htmlFor="task-due">Prazo</Label>
            <Input
              id="task-due"
              type="date"
              value={taskForm.dueDate}
              onChange={(event) => setTaskField("dueDate", event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="task-diary">Diário</Label>
            <select
              id="task-diary"
              value={taskForm.diaryId}
              onChange={(event) => setTaskField("diaryId", event.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">— sem vínculo —</option>
              {diaries.map((diary) => (
                <option key={diary.id} value={diary.id}>
                  {diary.code} · {diary.entryDate}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="task-wbs">WBS</Label>
            <select
              id="task-wbs"
              value={taskForm.wbsNodeId}
              onChange={(event) => setTaskField("wbsNodeId", event.target.value)}
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
            <Label htmlFor="task-activity">Atividade</Label>
            <select
              id="task-activity"
              value={taskForm.activityId}
              onChange={(event) => setTaskField("activityId", event.target.value)}
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
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="task-description">Descrição</Label>
            <textarea
              id="task-description"
              value={taskForm.description}
              onChange={(event) => setTaskField("description", event.target.value)}
              rows={3}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setTaskDialog(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void submitTask()} disabled={busy || !taskForm.title}>
            {busy ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </Dialog>

      {/* Restrição */}
      <Dialog
        open={constraintDialog}
        title={editingConstraintId ? "Editar restrição" : "Nova restrição"}
        onClose={() => setConstraintDialog(false)}
        wide
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="constraint-title">Título *</Label>
            <Input
              id="constraint-title"
              value={constraintForm.title}
              onChange={(event) => setConstraintField("title", event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="constraint-type">Tipo</Label>
            <select
              id="constraint-type"
              value={constraintForm.type}
              onChange={(event) => setConstraintField("type", event.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              {CONSTRAINT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {CONSTRAINT_TYPE_LABELS_PT[type as ConstraintType]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="constraint-priority">Prioridade</Label>
            <select
              id="constraint-priority"
              value={constraintForm.priority}
              onChange={(event) => setConstraintField("priority", event.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
                  {FIELD_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {FIELD_PRIORITY_LABELS_PT[priority]}
                    </option>
                  ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="constraint-owner">Responsável</Label>
            <select
              id="constraint-owner"
              value={constraintForm.ownerId}
              onChange={(event) => setConstraintField("ownerId", event.target.value)}
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
            <Label htmlFor="constraint-due">Prazo</Label>
            <Input
              id="constraint-due"
              type="date"
              value={constraintForm.dueDate}
              onChange={(event) => setConstraintField("dueDate", event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="constraint-wbs">WBS</Label>
            <select
              id="constraint-wbs"
              value={constraintForm.wbsNodeId}
              onChange={(event) => setConstraintField("wbsNodeId", event.target.value)}
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
            <Label htmlFor="constraint-activity">Atividade</Label>
            <select
              id="constraint-activity"
              value={constraintForm.activityId}
              onChange={(event) => setConstraintField("activityId", event.target.value)}
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
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="constraint-description">Descrição</Label>
            <textarea
              id="constraint-description"
              value={constraintForm.description}
              onChange={(event) => setConstraintField("description", event.target.value)}
              rows={3}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConstraintDialog(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void submitConstraint()} disabled={busy || !constraintForm.title}>
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
                onChange={(event) =>
                  setTransition((previous) =>
                    previous ? { ...previous, action: event.target.value } : previous
                  )
                }
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

            {(transition.action === "REJECT" || transition.action === "CANCEL") && (
              <div className="grid gap-2">
                <Label htmlFor="transition-reason">Motivo *</Label>
                <textarea
                  id="transition-reason"
                  value={transition.reason}
                  onChange={(event) =>
                    setTransition((previous) =>
                      previous ? { ...previous, reason: event.target.value } : previous
                    )
                  }
                  rows={2}
                  className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
                />
              </div>
            )}

            {transition.kind === "constraint" && transition.action === "REMOVE" && (
              <div className="grid gap-2">
                <Label htmlFor="transition-resolution">Como foi resolvida? *</Label>
                <textarea
                  id="transition-resolution"
                  value={transition.resolution}
                  onChange={(event) =>
                    setTransition((previous) =>
                      previous ? { ...previous, resolution: event.target.value } : previous
                    )
                  }
                  rows={3}
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
                disabled={busy || !transition.action}
              >
                {busy ? "Aplicando…" : "Aplicar"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Envio de foto */}
      <Dialog
        open={photoDialog}
        title="Enviar foto"
        onClose={() => {
          setPhotoDialog(false);
          setPhotoCaption("");
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
      >
        <div className="flex flex-col gap-3">
          <div className="grid gap-2">
            <Label htmlFor="photo-file">Arquivo (JPG/PNG/WebP, até 4 MB) *</Label>
            <input
              ref={fileInputRef}
              id="photo-file"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void submitPhoto(file);
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="photo-caption">Legenda</Label>
            <Input
              id="photo-caption"
              value={photoCaption}
              onChange={(event) => setPhotoCaption(event.target.value)}
              placeholder="Ex.: alvenaria 2º pavimento"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="photo-diary">Vincular ao diário</Label>
            <select
              id="photo-diary"
              value={photoDiaryId}
              onChange={(event) => setPhotoDiaryId(event.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">— sem vínculo —</option>
              {diaries.map((diary) => (
                <option key={diary.id} value={diary.id}>
                  {diary.code} · {diary.entryDate}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            O envio acontece imediatamente ao escolher o arquivo; a legenda pode ser editada depois.
          </p>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            variant="outline"
            onClick={() => {
              setPhotoDialog(false);
              setPhotoCaption("");
            }}
          >
            Fechar
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
