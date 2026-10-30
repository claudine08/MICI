"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { CloudOff, Plus, Pencil, Trash2, ArrowRightLeft, Camera, Eye } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import {
  discardFailedItems,
  flushQueue,
  getQueueCounts,
  sendOrQueueCreate,
  sendOrQueueEdit,
  sendOrQueuePhoto,
} from "@/lib/offline-queue";
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
  PROGRESS_LEVEL_LABELS_PT,
  PROGRESS_METHOD_LABELS_PT,
  PROGRESS_METHODS,
  TASK_ACTION_LABELS_PT,
  TASK_STATUS_LABELS_PT,
  availableConstraintActions,
  availableDiaryActions,
  availableTaskActions,
  isConstraintEditable,
  isDiaryEditable,
  isTaskEditable,
  type ConstraintStatus,
  type ConstraintType,
  type DiaryStatus,
  type FieldBoardCounts,
  type ProgressMethodValue,
  type TaskStatus,
} from "@/modules/field/engine";
import type {
  ConstraintRow,
  DiaryRow,
  PhotoRow,
  ProgressRow,
  TaskRow,
} from "@/modules/field/selectors";

// Campo (E12, §38) — mobile-first: poucos campos, home do dia
// (Hoje/Esta semana/Atrasadas/Restrições) e cinco blocos operacionais.

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
  initialProgress: ProgressRow[];
  board: FieldBoardCounts;
  physicalAverage: number;
  members: OptionLite[];
  wbsNodes: OptionLite[];
  activities: OptionLite[];
  inspections: OptionLite[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canReject: boolean;
}

type Tab = "diarios" | "tarefas" | "restricoes" | "fotos" | "avancos";

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

function InfoBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
      {message}
    </p>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-6 text-center text-sm text-muted-foreground">{text}</p>;
}

const emptyDiaryForm = {
  code: "",
  clientUuid: "",
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
  clientUuid: "",
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
  clientUuid: "",
  title: "",
  description: "",
  type: "EXTERNAL",
  priority: "MEDIUM",
  ownerId: "",
  dueDate: "",
  wbsNodeId: "",
  activityId: "",
};

const emptyProgressForm = {
  clientUuid: "",
  measurementDate: "",
  wbsNodeId: "",
  activityId: "",
  method: "PHYSICAL" as ProgressMethodValue,
  progressPercent: "",
  quantityPlanned: "",
  quantityReal: "",
  unit: "",
  criterion: "",
  notes: "",
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
  initialProgress,
  board,
  physicalAverage,
  members,
  wbsNodes,
  activities,
  inspections,
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
  const progressBase = `/api/v1/projects/${projectId}/field/progress`;

  const [tab, setTab] = useState<Tab>("diarios");
  const [diaries, setDiaries] = useState<DiaryRow[]>(initialDiaries);
  const [tasks, setTasks] = useState<TaskRow[]>(initialTasks);
  const [constraints, setConstraints] = useState<ConstraintRow[]>(initialConstraints);
  const [photos, setPhotos] = useState<PhotoRow[]>(initialPhotos);
  const [progress, setProgress] = useState<ProgressRow[]>(initialProgress);

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

  const [progressDialog, setProgressDialog] = useState(false);
  const [editingProgressId, setEditingProgressId] = useState<string | null>(null);
  const [progressForm, setProgressForm] = useState(emptyProgressForm);

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
  const [editingPhoto, setEditingPhoto] = useState<PhotoRow | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoCaption, setPhotoCaption] = useState("");
  const [photoDiaryId, setPhotoDiaryId] = useState("");
  const [photoWbsNodeId, setPhotoWbsNodeId] = useState("");
  const [photoActivityId, setPhotoActivityId] = useState("");
  const [photoInspectionId, setPhotoInspectionId] = useState("");
  const [photoClientUuid, setPhotoClientUuid] = useState("");
  const [viewingPhoto, setViewingPhoto] = useState<PhotoRow | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAll = async () => {
    try {
      const [d, t, c, p, m] = await Promise.all([
        apiRequest<{ diaries: DiaryRow[] }>(diaryBase),
        apiRequest<{ tasks: TaskRow[] }>(taskBase),
        apiRequest<{ constraints: ConstraintRow[] }>(constraintBase),
        apiRequest<{ photos: PhotoRow[] }>(photoBase),
        apiRequest<{ progress: ProgressRow[] }>(progressBase),
      ]);
      setDiaries(d.diaries);
      setTasks(t.tasks);
      setConstraints(c.constraints);
      setPhotos(p.photos);
      setProgress(m.progress);
      setError(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao carregar os dados de campo.");
    }
  };

  // --- Fila offline (E12 backlog §4) ---------------------------------------
  const [info, setInfo] = useState<string | null>(null);
  const [queuePending, setQueuePending] = useState(0);
  const [queueFailed, setQueueFailed] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshQueue = async () => {
    const counts = await getQueueCounts();
    setQueuePending(counts.pending);
    setQueueFailed(counts.failed);
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const result = await flushQueue();
      await refreshQueue();
      if (result.synced > 0) {
        setInfo(
          `${result.synced} registro(s) sincronizado(s) com o servidor${result.pending > 0 ? `; ${result.pending} ainda aguardando` : ""}.`
        );
        await loadAll();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao sincronizar a fila offline.");
    } finally {
      setSyncing(false);
    }
  };

  const discardFailed = async () => {
    if (!window.confirm("Descartar os registros que falharam na sincronização?")) return;
    await discardFailedItems();
    await refreshQueue();
  };

  // Conectividade via store externo (regra do React: sem setState síncrono
  // dentro de effect; o navegador é a fonte da verdade do estado online).
  const isOffline = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("online", onChange);
      window.addEventListener("offline", onChange);
      return () => {
        window.removeEventListener("online", onChange);
        window.removeEventListener("offline", onChange);
      };
    },
    () => navigator.onLine === false,
    () => false
  );

  useEffect(() => {
    const onQueueChanged = () => void refreshQueue();
    const onOnline = () => void syncNow();
    window.addEventListener("mici:queue-changed", onQueueChanged);
    window.addEventListener("online", onOnline);
    const initialRefresh = setTimeout(() => void refreshQueue(), 0);
    return () => {
      window.removeEventListener("mici:queue-changed", onQueueChanged);
      window.removeEventListener("online", onOnline);
      clearTimeout(initialRefresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Diário -------------------------------------------------------------
  const setDiaryField = (key: keyof typeof diaryForm, value: string) =>
    setDiaryForm((previous) => ({ ...previous, [key]: value }));

  const openDiaryCreate = () => {
    setEditingDiaryId(null);
    setDiaryForm({
      ...emptyDiaryForm,
      clientUuid: crypto.randomUUID(),
      entryDate: new Date().toISOString().slice(0, 10),
    });
    setError(null);
    setDiaryDialog(true);
  };

  const openDiaryEdit = (diary: DiaryRow) => {
    setEditingDiaryId(diary.id);
    setDiaryForm({
      code: diary.code,
      clientUuid: "",
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
    setInfo(null);
    try {
      const payload: Record<string, unknown> = cleanPayload(diaryForm);
      if (diaryForm.workHours !== "") payload.workHours = Number(diaryForm.workHours);
      if (editingDiaryId) {
        // Regra de conflito: edição offline só de rascunho editável (última
        // gravação vence); replay revalida o status no servidor.
        const row = diaries.find((diary) => diary.id === editingDiaryId);
        if (row && isDiaryEditable(row.status)) {
          const outcome = await sendOrQueueEdit({
            entity: "diary",
            projectId,
            url: `${diaryBase}/${editingDiaryId}`,
            payload,
          });
          if (outcome === "queued") {
            setDiaryDialog(false);
            setInfo("Sem conexão: alteração do rascunho salva offline. Sincroniza ao voltar a rede.");
            await refreshQueue();
            return;
          }
        } else {
          await apiRequest(`${diaryBase}/${editingDiaryId}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          });
        }
      } else {
        const outcome = await sendOrQueueCreate({
          entity: "diary",
          projectId,
          url: diaryBase,
          payload,
        });
        if (outcome === "queued") {
          setDiaryDialog(false);
          setInfo("Sem conexão: diário salvo offline. Sincronizamos automaticamente ao voltar a rede.");
          await refreshQueue();
          return;
        }
      }
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
    setTaskForm({ ...emptyTaskForm, clientUuid: crypto.randomUUID() });
    setError(null);
    setTaskDialog(true);
  };

  const openTaskEdit = (task: TaskRow) => {
    setEditingTaskId(task.id);
    setTaskForm({
      code: task.code,
      clientUuid: "",
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
    setInfo(null);
    try {
      const payload = cleanPayload(taskForm);
      if (editingTaskId) {
        const row = tasks.find((task) => task.id === editingTaskId);
        if (row && isTaskEditable(row.status)) {
          const outcome = await sendOrQueueEdit({
            entity: "task",
            projectId,
            url: `${taskBase}/${editingTaskId}`,
            payload,
          });
          if (outcome === "queued") {
            setTaskDialog(false);
            setInfo("Sem conexão: alteração da tarefa salva offline. Sincroniza ao voltar a rede.");
            await refreshQueue();
            return;
          }
        } else {
          await apiRequest(`${taskBase}/${editingTaskId}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          });
        }
      } else {
        const outcome = await sendOrQueueCreate({
          entity: "task",
          projectId,
          url: taskBase,
          payload,
        });
        if (outcome === "queued") {
          setTaskDialog(false);
          setInfo("Sem conexão: tarefa salva offline. Sincronizamos automaticamente ao voltar a rede.");
          await refreshQueue();
          return;
        }
      }
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
    setConstraintForm({ ...emptyConstraintForm, clientUuid: crypto.randomUUID() });
    setError(null);
    setConstraintDialog(true);
  };

  const openConstraintEdit = (constraint: ConstraintRow) => {
    setEditingConstraintId(constraint.id);
    setConstraintForm({
      code: constraint.code,
      clientUuid: "",
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
    setInfo(null);
    try {
      const payload = cleanPayload(constraintForm);
      if (editingConstraintId) {
        const row = constraints.find((item) => item.id === editingConstraintId);
        if (row && isConstraintEditable(row.status)) {
          const outcome = await sendOrQueueEdit({
            entity: "constraint",
            projectId,
            url: `${constraintBase}/${editingConstraintId}`,
            payload,
          });
          if (outcome === "queued") {
            setConstraintDialog(false);
            setInfo("Sem conexão: alteração da restrição salva offline. Sincroniza ao voltar a rede.");
            await refreshQueue();
            return;
          }
        } else {
          await apiRequest(`${constraintBase}/${editingConstraintId}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          });
        }
      } else {
        const outcome = await sendOrQueueCreate({
          entity: "constraint",
          projectId,
          url: constraintBase,
          payload,
        });
        if (outcome === "queued") {
          setConstraintDialog(false);
          setInfo(
            "Sem conexão: restrição salva offline. Sincronizamos automaticamente ao voltar a rede."
          );
          await refreshQueue();
          return;
        }
      }
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

  // --- Medição de avanço físico (BR-006) ----------------------------------
  const setProgressField = (key: keyof typeof progressForm, value: string) =>
    setProgressForm((previous) => ({ ...previous, [key]: value }));

  const openProgressCreate = () => {
    setEditingProgressId(null);
    setProgressForm({
      ...emptyProgressForm,
      clientUuid: crypto.randomUUID(),
      measurementDate: new Date().toISOString().slice(0, 10),
    });
    setError(null);
    setProgressDialog(true);
  };

  const openProgressEdit = (measurement: ProgressRow) => {
    setEditingProgressId(measurement.id);
    setProgressForm({
      clientUuid: "",
      measurementDate: measurement.measurementDate,
      wbsNodeId: measurement.wbsNodeId ?? "",
      activityId: measurement.activityId ?? "",
      method: measurement.method,
      progressPercent: String(measurement.progressPercent),
      quantityPlanned:
        measurement.quantityPlanned === null ? "" : String(measurement.quantityPlanned),
      quantityReal: measurement.quantityReal === null ? "" : String(measurement.quantityReal),
      unit: measurement.unit ?? "",
      criterion: measurement.criterion,
      notes: measurement.notes ?? "",
    });
    setError(null);
    setProgressDialog(true);
  };

  const submitProgress = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const payload: Record<string, unknown> = cleanPayload(progressForm);
      if (progressForm.progressPercent !== "")
        payload.progressPercent = Number(progressForm.progressPercent);
      if (progressForm.quantityPlanned !== "")
        payload.quantityPlanned = Number(progressForm.quantityPlanned);
      if (progressForm.quantityReal !== "")
        payload.quantityReal = Number(progressForm.quantityReal);
      if (editingProgressId) {
        // Medição não tem máquina de estados — edição offline é last-wins puro.
        const outcome = await sendOrQueueEdit({
          entity: "progress",
          projectId,
          url: `${progressBase}/${editingProgressId}`,
          payload,
        });
        if (outcome === "queued") {
          setProgressDialog(false);
          setInfo("Sem conexão: alteração da medição salva offline. Sincroniza ao voltar a rede.");
          await refreshQueue();
          return;
        }
      } else {
        const outcome = await sendOrQueueCreate({
          entity: "progress",
          projectId,
          url: progressBase,
          payload,
        });
        if (outcome === "queued") {
          setProgressDialog(false);
          setInfo(
            "Sem conexão: medição salva offline. Sincronizamos automaticamente ao voltar a rede."
          );
          await refreshQueue();
          return;
        }
      }
      setProgressDialog(false);
      await loadAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar a medição.");
    } finally {
      setBusy(false);
    }
  };

  const removeProgress = async (measurement: ProgressRow) => {
    if (!window.confirm(`Excluir a medição ${measurement.code}?`)) return;
    try {
      await apiRequest(`${progressBase}/${measurement.id}`, { method: "DELETE" });
      await loadAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao excluir a medição.");
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
  const photoUrl = (photoId: string) => `/api/v1/projects/${projectId}/field/photos/${photoId}`;

  const resetPhotoForm = () => {
    setEditingPhoto(null);
    setPhotoFile(null);
    setPhotoPreviewUrl((previous) => {
      if (previous?.startsWith("blob:")) URL.revokeObjectURL(previous);
      return null;
    });
    setPhotoCaption("");
    setPhotoDiaryId("");
    setPhotoWbsNodeId("");
    setPhotoActivityId("");
    setPhotoInspectionId("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openPhotoDialog = () => {
    resetPhotoForm();
    setPhotoClientUuid(crypto.randomUUID());
    setError(null);
    setPhotoDialog(true);
  };

  const openPhotoEdit = (photo: PhotoRow) => {
    resetPhotoForm();
    setEditingPhoto(photo);
    setPhotoCaption(photo.caption ?? "");
    setPhotoDiaryId(photo.diaryId ?? "");
    setPhotoWbsNodeId(photo.wbsNodeId ?? "");
    setPhotoActivityId(photo.activityId ?? "");
    setPhotoInspectionId(photo.inspectionId ?? "");
    setError(null);
    setPhotoDialog(true);
  };

  const closePhotoDialog = () => {
    setPhotoDialog(false);
    resetPhotoForm();
  };

  const selectPhotoFile = (file: File) => {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  };

  const submitPhoto = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (editingPhoto) {
        await apiRequest(`${photoBase}/${editingPhoto.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            caption: photoCaption || undefined,
            diaryId: photoDiaryId || null,
            wbsNodeId: photoWbsNodeId || null,
            activityId: photoActivityId || null,
            inspectionId: photoInspectionId || null,
          }),
        });
      } else {
        if (!photoFile) throw new Error("Selecione a foto antes de enviar.");
        // Valida igual ao servidor ANTES de enviar/enfileirar: um arquivo que
        // o server rejeitaria viraria "falha" na fila sem motivo aparente.
        const allowed = [
          "image/png",
          "image/jpeg",
          "image/webp",
          "image/gif",
          "image/heic",
          "image/heif",
        ];
        if (!allowed.includes(photoFile.type)) {
          throw new Error(
            `Tipo de arquivo não permitido para foto: ${photoFile.type || "desconhecido"}.`
          );
        }
        if (photoFile.size > 4 * 1024 * 1024) {
          throw new Error("Foto acima de 4 MB. Comprima a imagem antes de enviar.");
        }
        const meta: Record<string, unknown> = {};
        if (photoCaption) meta.caption = photoCaption;
        if (photoDiaryId) meta.diaryId = photoDiaryId;
        if (photoWbsNodeId) meta.wbsNodeId = photoWbsNodeId;
        if (photoActivityId) meta.activityId = photoActivityId;
        if (photoInspectionId) meta.inspectionId = photoInspectionId;
        if (photoClientUuid) meta.clientUuid = photoClientUuid;
        const outcome = await sendOrQueuePhoto({
          projectId,
          url: photoBase,
          meta,
          file: photoFile,
          fileName: photoFile.name,
          mimeType: photoFile.type,
        });
        if (outcome === "queued") {
          closePhotoDialog();
          setInfo(
            "Sem conexão: foto salva offline (até 4 MB). Será enviada ao voltar a rede, junto com as outras pendências."
          );
          await refreshQueue();
          return;
        }
      }
      closePhotoDialog();
      await loadAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar a foto.");
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
    { id: "avancos", label: "Avanço", count: progress.length },
  ];

  return (
    <div className="flex flex-col gap-6">
      <ErrorBox message={error} />
      <InfoBox message={info} />

      {(isOffline || queuePending > 0 || queueFailed > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <span className="flex items-center gap-2 text-foreground">
            <CloudOff className="h-4 w-4 shrink-0 text-warning" />
            {isOffline && queuePending > 0
              ? `Offline — ${queuePending} registro(s) aguardando sincronização.`
              : isOffline
                ? "Offline — registros criados agora serão salvos localmente."
                : `${queuePending} registro(s) prontos para sincronizar${queueFailed > 0 ? ` · ${queueFailed} com falha` : ""}.`}
          </span>
          <span className="flex gap-2">
            {queuePending > 0 && (
              <Button size="sm" variant="outline" disabled={syncing || isOffline} onClick={() => void syncNow()}>
                {syncing ? "Sincronizando…" : "Sincronizar agora"}
              </Button>
            )}
            {queueFailed > 0 && (
              <Button size="sm" variant="ghost" disabled={syncing} onClick={() => void discardFailed()}>
                Descartar falhas
              </Button>
            )}
          </span>
        </div>
      )}

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Resumo de campo</h2>
          <span className="text-xs text-muted-foreground">Hoje · semana · atrasos · §38</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Hoje", value: board.today },
            { label: "Esta semana", value: board.thisWeek },
            { label: "Tarefas atrasadas", value: board.overdue },
            { label: "Restrições abertas", value: board.openConstraints },
            { label: "Avanço físico", value: `${physicalAverage}%` },
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
          <Button onClick={openPhotoDialog}>
            <Camera className="h-4 w-4" />
            Enviar foto
          </Button>
        )}
        {tab === "avancos" && canCreate && (
          <Button onClick={openProgressCreate}>
            <Plus className="h-4 w-4" />
            Nova medição
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
                <button
                  type="button"
                  onClick={() => setViewingPhoto(photo)}
                  title="Ver em tamanho real"
                  className="overflow-hidden rounded-md border border-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoUrl(photo.id)}
                    alt={photo.caption ?? photo.code}
                    className="h-32 w-full bg-background object-cover transition hover:opacity-90"
                    loading="lazy"
                  />
                </button>
                <div className="text-xs">
                  <div className="font-mono">{photo.code}</div>
                  <div className="line-clamp-2 text-muted-foreground">
                    {photo.caption ?? photo.fileName}
                  </div>
                  <div className="text-muted-foreground">
                    {[
                      photo.diaryCode ? `Diário ${photo.diaryCode}` : "",
                      photo.wbsNodeCode ? `WBS ${photo.wbsNodeCode}` : "",
                      photo.activityCode ? `Ativ. ${photo.activityCode}` : "",
                      photo.inspectionCode ? `Insp. ${photo.inspectionCode}` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  <div className="text-muted-foreground">{photo.createdAt.slice(0, 10)}</div>
                </div>
                <div className="flex gap-1">
                  {(canEdit || canDelete) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start"
                      onClick={() => setViewingPhoto(photo)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Ver
                    </Button>
                  )}
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start"
                      onClick={() => openPhotoEdit(photo)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </Button>
                  )}
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
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "avancos" && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Avanço físico (BR-006, §12)</h2>
              <p className="text-xs text-muted-foreground">
                Medição por quantidade física real — nunca percentual financeiro
              </p>
            </div>
            {canCreate && (
              <Button onClick={openProgressCreate}>
                <Plus className="h-4 w-4" />
                Nova medição
              </Button>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2.5">Código</th>
                  <th className="px-4 py-2.5">Data</th>
                  <th className="px-4 py-2.5">Nível</th>
                  <th className="px-4 py-2.5">Vínculo</th>
                  <th className="px-4 py-2.5">Método</th>
                  <th className="px-4 py-2.5 text-right">Avanço</th>
                  <th className="px-4 py-2.5 text-right">Qtd. real</th>
                  <th className="px-4 py-2.5">Critério</th>
                  {(canEdit || canDelete) && <th className="px-4 py-2.5 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {progress.length === 0 && (
                  <tr>
                    <td colSpan={9}>
                      <Empty text="Nenhuma medição registrada." />
                    </td>
                  </tr>
                )}
                {progress.map((measurement) => (
                  <tr key={measurement.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs">{measurement.code}</td>
                    <td className="px-4 py-2.5">{measurement.measurementDate}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {PROGRESS_LEVEL_LABELS_PT[measurement.level]}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {measurement.activityCode
                        ? `Ativ. ${measurement.activityCode}`
                        : measurement.wbsNodeCode
                          ? `WBS ${measurement.wbsNodeCode}`
                          : "Projeto"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {PROGRESS_METHOD_LABELS_PT[measurement.method]}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">
                      {measurement.progressPercent}%
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {measurement.quantityReal === null
                        ? "—"
                        : `${measurement.quantityReal}${measurement.unit ? ` ${measurement.unit}` : ""}`}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      <span className="line-clamp-2">{measurement.criterion}</span>
                    </td>
                    {(canEdit || canDelete) && (
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Editar medição"
                              onClick={() => openProgressEdit(measurement)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Excluir medição"
                              onClick={() => void removeProgress(measurement)}
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

      {/* Envio/edição de foto */}
      <Dialog
        open={photoDialog}
        title={editingPhoto ? `Editar foto ${editingPhoto.code}` : "Enviar foto"}
        onClose={closePhotoDialog}
      >
        <div className="flex flex-col gap-3">
          {editingPhoto ? (
            <div className="overflow-hidden rounded-md border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl(editingPhoto.id)}
                alt={editingPhoto.caption ?? editingPhoto.code}
                className="max-h-64 w-full bg-background object-contain"
              />
            </div>
          ) : (
            <>
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
                    if (file) selectPhotoFile(file);
                  }}
                />
              </div>
              {photoPreviewUrl && (
                <div className="overflow-hidden rounded-md border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoPreviewUrl}
                    alt="Pré-visualização da foto selecionada"
                    className="max-h-64 w-full bg-background object-contain"
                  />
                </div>
              )}
            </>
          )}
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
          <div className="grid gap-2">
            <Label htmlFor="photo-wbs">Vincular ao WBS</Label>
            <select
              id="photo-wbs"
              value={photoWbsNodeId}
              onChange={(event) => setPhotoWbsNodeId(event.target.value)}
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
            <Label htmlFor="photo-activity">Vincular à atividade</Label>
            <select
              id="photo-activity"
              value={photoActivityId}
              onChange={(event) => setPhotoActivityId(event.target.value)}
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
            <Label htmlFor="photo-inspection">Vincular à inspeção (evidência §33)</Label>
            <select
              id="photo-inspection"
              value={photoInspectionId}
              onChange={(event) => setPhotoInspectionId(event.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">— sem vínculo —</option>
              {inspections.map((inspection) => (
                <option key={inspection.id} value={inspection.id}>
                  {inspection.label}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            {editingPhoto
              ? "A imagem não muda — legenda e vínculos podem ser ajustados aqui."
              : "Preencha os dados e clique em enviar; nada é enviado antes disso."}
          </p>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={closePhotoDialog}>
            Cancelar
          </Button>
          <Button
            onClick={() => void submitPhoto()}
            disabled={busy || (!editingPhoto && !photoFile)}
          >
            {busy ? "Salvando…" : editingPhoto ? "Salvar alterações" : "Enviar foto"}
          </Button>
        </div>
      </Dialog>

      {/* Visualização de foto */}
      <Dialog
        open={viewingPhoto !== null}
        title={viewingPhoto ? `${viewingPhoto.code} — foto de evidência` : "Foto"}
        onClose={() => setViewingPhoto(null)}
        wide
      >
        {viewingPhoto && (
          <div className="flex flex-col gap-3">
            <div className="overflow-hidden rounded-md border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl(viewingPhoto.id)}
                alt={viewingPhoto.caption ?? viewingPhoto.code}
                className="max-h-[60vh] w-full bg-background object-contain"
              />
            </div>
            <div className="text-sm">
              <div className="font-mono text-xs">{viewingPhoto.code}</div>
              <div>{viewingPhoto.caption ?? "—"}</div>
              <div className="text-xs text-muted-foreground">
                {viewingPhoto.fileName} · {Math.round(viewingPhoto.sizeBytes / 1024)} KB ·{" "}
                {viewingPhoto.createdAt.slice(0, 10)}
              </div>
              <div className="text-xs text-muted-foreground">
                {[
                  viewingPhoto.diaryCode ? `Diário ${viewingPhoto.diaryCode}` : "",
                  viewingPhoto.wbsNodeCode ? `WBS ${viewingPhoto.wbsNodeCode}` : "",
                  viewingPhoto.activityCode ? `Ativ. ${viewingPhoto.activityCode}` : "",
                  viewingPhoto.inspectionCode ? `Insp. ${viewingPhoto.inspectionCode}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <a
                href={photoUrl(viewingPhoto.id)}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-primary underline-offset-2 hover:underline"
              >
                Abrir em tamanho real
              </a>
              <div className="flex gap-2">
                {canEdit && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      const photo = viewingPhoto;
                      setViewingPhoto(null);
                      openPhotoEdit(photo);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                    Editar dados
                  </Button>
                )}
                <Button variant="outline" onClick={() => setViewingPhoto(null)}>
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* Medição de avanço físico */}
      <Dialog
        open={progressDialog}
        title={editingProgressId ? "Editar medição" : "Nova medição de avanço"}
        onClose={() => setProgressDialog(false)}
        wide
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="progress-date">Data da medição *</Label>
            <Input
              id="progress-date"
              type="date"
              value={progressForm.measurementDate}
              onChange={(event) => setProgressField("measurementDate", event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="progress-method">Método *</Label>
            <select
              id="progress-method"
              value={progressForm.method}
              onChange={(event) => setProgressField("method", event.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              {PROGRESS_METHODS.map((method) => (
                <option key={method} value={method}>
                  {PROGRESS_METHOD_LABELS_PT[method]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="progress-activity">Atividade</Label>
            <select
              id="progress-activity"
              value={progressForm.activityId}
              onChange={(event) => setProgressField("activityId", event.target.value)}
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
            <Label htmlFor="progress-wbs">Pacote WBS</Label>
            <select
              id="progress-wbs"
              value={progressForm.wbsNodeId}
              onChange={(event) => setProgressField("wbsNodeId", event.target.value)}
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
            <Label htmlFor="progress-percent">Avanço observado (%) *</Label>
            <Input
              id="progress-percent"
              type="number"
              min={0}
              max={100}
              step="any"
              value={progressForm.progressPercent}
              onChange={(event) => setProgressField("progressPercent", event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="progress-unit">Unidade</Label>
            <Input
              id="progress-unit"
              value={progressForm.unit}
              onChange={(event) => setProgressField("unit", event.target.value)}
              placeholder="Ex.: m³, ponto, ml"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="progress-planned">Quantidade planejada</Label>
            <Input
              id="progress-planned"
              type="number"
              min={0}
              step="any"
              value={progressForm.quantityPlanned}
              onChange={(event) => setProgressField("quantityPlanned", event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="progress-real">Quantidade física real</Label>
            <Input
              id="progress-real"
              type="number"
              min={0}
              step="any"
              value={progressForm.quantityReal}
              onChange={(event) => setProgressField("quantityReal", event.target.value)}
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="progress-criterion">Critério de verificação *</Label>
            <textarea
              id="progress-criterion"
              value={progressForm.criterion}
              onChange={(event) => setProgressField("criterion", event.target.value)}
              rows={2}
              placeholder="Ex.: 42 de 60 pontos executados conferidos em campo"
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="progress-notes">Observações</Label>
            <textarea
              id="progress-notes"
              value={progressForm.notes}
              onChange={(event) => setProgressField("notes", event.target.value)}
              rows={2}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setProgressDialog(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => void submitProgress()}
            disabled={
              busy ||
              !progressForm.criterion.trim() ||
              progressForm.progressPercent === "" ||
              !progressForm.measurementDate
            }
          >
            {busy ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
