"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Trash2,
  Upload,
  Send,
  CheckCircle2,
  XCircle,
  Rocket,
  Archive,
  History,
  Download,
  Link2,
  Unlink,
} from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";

// Visão de documentos do projeto (E09 §36): upload, revisão imutável
// (BR-009), aprovação, liberação e links genéricos (§92). Upload usa
// multipart FormData; download navega para a rota dedicada (cookie de sessão
// acompanha). Após cada mutação o load() refaz o GET e o router.refresh()
// sincroniza o server component.

export interface DocumentRow {
  id: string;
  projectId: string;
  code: string;
  title: string;
  discipline: string | null;
  classification: string | null;
  status: "WIP" | "FOR_REVIEW" | "APPROVED" | "RELEASED_FOR_EXECUTION" | "OBSOLETE";
  currentRevision: number;
  effectiveDate: string | null;
  expiryDate: string | null;
  currentFileName: string | null;
  currentFileSize: number | null;
  currentHash: string | null;
  currentRevisionId: string | null;
  revisionCount: number;
  version: number;
}

export interface DocumentRevisionRow {
  id: string;
  revision: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  hash: string;
  reason: string | null;
  status: string;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalComment: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface DocumentLinkRow {
  id: string;
  targetType: string;
  targetId: string;
  relationType: string;
  createdAt: string;
}

export interface DocumentDetailRow extends DocumentRow {
  revisions: DocumentRevisionRow[];
  links: DocumentLinkRow[];
}

export interface LinkTargetOption {
  id: string;
  label: string;
}

export interface LinkTargets {
  requirements: LinkTargetOption[];
  wbsNodes: LinkTargetOption[];
  activities: LinkTargetOption[];
  costItems: LinkTargetOption[];
}

interface Props {
  projectId: string;
  initialDocuments: DocumentRow[];
  linkTargets: LinkTargets;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
}

const STATUS_BADGE: Record<DocumentRow["status"], { label: string; className: string }> = {
  WIP: { label: "Rascunho", className: "bg-secondary text-secondary-foreground" },
  FOR_REVIEW: { label: "Em análise", className: "bg-blue-500/15 text-blue-600" },
  APPROVED: { label: "Aprovado", className: "bg-emerald-500/15 text-emerald-600" },
  RELEASED_FOR_EXECUTION: { label: "Liberado", className: "bg-primary/15 text-primary" },
  OBSOLETE: { label: "Obsoleto", className: "bg-muted text-muted-foreground" },
};

const RELATION_OPTIONS = [
  "SATISFIES",
  "EVIDENCES",
  "IMPLEMENTS",
  "IMPACTS",
  "DEPENDS_ON",
  "RELATED_TO",
  "GENERATED_BY",
  "SUPERSEDES",
];

const TARGET_TYPE_OPTIONS = [
  { value: "REQUIREMENT", label: "Requisito" },
  { value: "WBS_NODE", label: "Nó de WBS" },
  { value: "SCHEDULE_ACTIVITY", label: "Atividade" },
  { value: "COST_ITEM", label: "Item de custo" },
  { value: "DOCUMENT", label: "Documento (outro)" },
];

type TargetTypeKey = (typeof TARGET_TYPE_OPTIONS)[number]["value"];

function fileSize(size: number | null): string {
  if (size === null) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

// Mesmo limite do servidor (storage.ts): acima disso a Vercel corta a
// conexão do upload e o fetch falha com "Failed to fetch" sem resposta.
const MAX_FILE_BYTES = 4 * 1024 * 1024;

function fileValidationError(file: File): string | null {
  if (file.size > MAX_FILE_BYTES) {
    return `Arquivo excede o limite de 4 MB (selecionado: ${fileSize(file.size)}).`;
  }
  return null;
}

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

interface CreateForm {
  code: string;
  title: string;
  discipline: string;
  classification: string;
  expiryDate: string;
  file: File | null;
}

const emptyCreateForm: CreateForm = {
  code: "",
  title: "",
  discipline: "",
  classification: "",
  expiryDate: "",
  file: null,
};

interface EditForm {
  title: string;
  discipline: string;
  classification: string;
  expiryDate: string;
}

interface RevisionForm {
  reason: string;
  file: File | null;
}

interface ActionForm {
  comment: string;
  reason: string;
  effectiveDate: string;
}

const emptyActionForm: ActionForm = { comment: "", reason: "", effectiveDate: "" };

type ActionKind = "APPROVE" | "REJECT" | "RELEASE" | "OBSOLETE";

const ACTION_TITLE: Record<ActionKind, string> = {
  APPROVE: "Aprovar documento",
  REJECT: "Rejeitar documento",
  RELEASE: "Liberar para execução",
  OBSOLETE: "Marcar como obsoleto",
};

export function DocumentView({
  projectId,
  initialDocuments,
  linkTargets,
  canCreate,
  canEdit,
  canDelete,
  canApprove,
}: Props) {
  const router = useRouter();
  const base = `/api/v1/projects/${projectId}/documents`;

  const [documents, setDocuments] = useState<DocumentRow[]>(initialDocuments);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [createDialog, setCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreateForm);

  const [editDialog, setEditDialog] = useState(false);
  const [editingDoc, setEditingDoc] = useState<DocumentRow | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ title: "", discipline: "", classification: "", expiryDate: "" });

  const [revisionDialog, setRevisionDialog] = useState(false);
  const [revisionDoc, setRevisionDoc] = useState<DocumentRow | null>(null);
  const [revisionForm, setRevisionForm] = useState<RevisionForm>({ reason: "", file: null });

  const [actionDialog, setActionDialog] = useState(false);
  const [actionDoc, setActionDoc] = useState<DocumentRow | null>(null);
  const [actionKind, setActionKind] = useState<ActionKind>("APPROVE");
  const [actionForm, setActionForm] = useState<ActionForm>(emptyActionForm);

  const [detailDialog, setDetailDialog] = useState(false);
  const [detail, setDetail] = useState<DocumentDetailRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [linkDialog, setLinkDialog] = useState(false);
  const [linkDoc, setLinkDoc] = useState<DocumentRow | null>(null);
  const [linkForm, setLinkForm] = useState({ targetType: "REQUIREMENT" as TargetTypeKey, targetId: "", relationType: "SATISFIES" });

  const load = async () => {
    try {
      const payload = await apiRequest<{ documents: DocumentRow[] }>(base);
      setDocuments(payload.documents);
      setError(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao carregar documentos.");
    }
  };

  const openCreate = () => {
    setCreateForm(emptyCreateForm);
    setError(null);
    setCreateDialog(true);
  };

  const submitCreate = async () => {
    if (!createForm.file) {
      setError("Selecione o arquivo da revisão 1.");
      return;
    }
    const validationError = fileValidationError(createForm.file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const formData = new FormData();
      if (createForm.code) formData.set("code", createForm.code);
      formData.set("title", createForm.title);
      if (createForm.discipline) formData.set("discipline", createForm.discipline);
      if (createForm.classification) formData.set("classification", createForm.classification);
      if (createForm.expiryDate) formData.set("expiryDate", createForm.expiryDate);
      formData.set("file", createForm.file);
      await apiRequest(base, { method: "POST", body: formData });
      setCreateDialog(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao criar documento.");
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (doc: DocumentRow) => {
    setEditingDoc(doc);
    setEditForm({
      title: doc.title,
      discipline: doc.discipline ?? "",
      classification: doc.classification ?? "",
      expiryDate: doc.expiryDate ?? "",
    });
    setError(null);
    setEditDialog(true);
  };

  const submitEdit = async () => {
    if (!editingDoc) return;
    setError(null);
    setBusy(true);
    try {
      await apiRequest(`${base}/${editingDoc.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: editForm.title,
          discipline: editForm.discipline || undefined,
          classification: editForm.classification || undefined,
          expiryDate: editForm.expiryDate || null,
        }),
      });
      setEditDialog(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar documento.");
    } finally {
      setBusy(false);
    }
  };

  const openRevision = (doc: DocumentRow) => {
    setRevisionDoc(doc);
    setRevisionForm({ reason: "", file: null });
    setError(null);
    setRevisionDialog(true);
  };

  const submitRevision = async () => {
    if (!revisionDoc) return;
    if (!revisionForm.file) {
      setError("Selecione o arquivo da nova revisão.");
      return;
    }
    const validationError = fileValidationError(revisionForm.file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const formData = new FormData();
      formData.set("reason", revisionForm.reason);
      formData.set("file", revisionForm.file);
      await apiRequest(`${base}/${revisionDoc.id}/revisions`, { method: "POST", body: formData });
      setRevisionDialog(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao criar revisão.");
    } finally {
      setBusy(false);
    }
  };

  const openAction = (doc: DocumentRow, kind: ActionKind) => {
    setActionDoc(doc);
    setActionKind(kind);
    setActionForm({
      comment: "",
      reason: "",
      effectiveDate: new Date().toISOString().slice(0, 10),
    });
    setError(null);
    setActionDialog(true);
  };

  const submitAction = async () => {
    if (!actionDoc) return;
    setError(null);
    setBusy(true);
    try {
      await apiRequest(`${base}/${actionDoc.id}/status`, {
        method: "POST",
        body: JSON.stringify({
          action: actionKind,
          ...(actionKind === "APPROVE" ? { comment: actionForm.comment || undefined } : {}),
          ...(actionKind === "REJECT" ? { reason: actionForm.reason } : {}),
          ...(actionKind === "RELEASE"
            ? { effectiveDate: actionForm.effectiveDate, comment: actionForm.comment || undefined }
            : {}),
          ...(actionKind === "OBSOLETE" ? { reason: actionForm.reason } : {}),
        }),
      });
      setActionDialog(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha na operação.");
    } finally {
      setBusy(false);
    }
  };

  const submitForReview = async (doc: DocumentRow) => {
    setError(null);
    setBusy(true);
    try {
      await apiRequest(`${base}/${doc.id}/status`, { method: "POST", body: JSON.stringify({ action: "SUBMIT" }) });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao enviar para análise.");
    } finally {
      setBusy(false);
    }
  };

  const removeDocument = async (doc: DocumentRow) => {
    if (!window.confirm(`Excluir o documento ${doc.code}? A exclusão é lógica (auditoria preservada).`)) return;
    setError(null);
    try {
      await apiRequest(`${base}/${doc.id}`, { method: "DELETE" });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao excluir documento.");
    }
  };

  const openDetail = async (doc: DocumentRow) => {
    setDetailLoading(true);
    setDetailDialog(true);
    try {
      const payload = await apiRequest<{ document: DocumentDetailRow }>(`${base}/${doc.id}`);
      setDetail(payload.document);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao carregar detalhes.");
      setDetailDialog(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const openLinks = (doc: DocumentRow) => {
    setLinkDoc(doc);
    setLinkForm({ targetType: "REQUIREMENT", targetId: "", relationType: "SATISFIES" });
    setError(null);
    setLinkDialog(true);
    void openDetail(doc);
  };

  const targetOptions = (type: TargetTypeKey): LinkTargetOption[] => {
    switch (type) {
      case "REQUIREMENT":
        return linkTargets.requirements;
      case "WBS_NODE":
        return linkTargets.wbsNodes;
      case "SCHEDULE_ACTIVITY":
        return linkTargets.activities;
      case "COST_ITEM":
        return linkTargets.costItems;
      case "DOCUMENT":
        return documents.map((d) => ({ id: d.id, label: `${d.code} — ${d.title}` }));
      default:
        return [];
    }
  };

  const addLink = async () => {
    if (!linkDoc || !linkForm.targetId) return;
    setError(null);
    setBusy(true);
    try {
      await apiRequest(`${base}/${linkDoc.id}/links`, {
        method: "POST",
        body: JSON.stringify(linkForm),
      });
      const payload = await apiRequest<{ document: DocumentDetailRow }>(`${base}/${linkDoc.id}`);
      setDetail(payload.document);
      setLinkForm((previous) => ({ ...previous, targetId: "" }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao criar link.");
    } finally {
      setBusy(false);
    }
  };

  const removeLink = async (docId: string, linkId: string) => {
    setError(null);
    try {
      await apiRequest(`${base}/${docId}/links/${linkId}`, { method: "DELETE" });
      const payload = await apiRequest<{ document: DocumentDetailRow }>(`${base}/${docId}`);
      setDetail(payload.document);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao remover link.");
    }
  };

  const triggerDownload = (url: string) => {
    const anchor = document.createElement("a");
    anchor.href = url;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const download = (doc: DocumentRow) => {
    if (!doc.currentRevisionId) return;
    triggerDownload(`${base}/${doc.id}/revisions/${doc.currentRevisionId}/download`);
  };

  const downloadRevisionById = (docId: string, revisionId: string) => {
    triggerDownload(`${base}/${docId}/revisions/${revisionId}/download`);
  };

  return (
    <div className="flex flex-col gap-4">
      <ErrorBox message={error} />

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Documentos</h2>
          {canCreate && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Novo documento
            </Button>
          )}
        </div>
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-2.5">Código</th>
                <th className="px-4 py-2.5">Título</th>
                <th className="px-4 py-2.5">Disciplina</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Revisão</th>
                <th className="px-4 py-2.5">Arquivo</th>
                <th className="px-4 py-2.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => {
                const badge = STATUS_BADGE[doc.status];
                return (
                  <tr key={doc.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs">{doc.code}</td>
                    <td className="px-4 py-2.5">{doc.title}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{doc.discipline ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono text-xs">R{doc.currentRevision}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {doc.currentFileName ?? "—"}
                      {doc.currentFileSize !== null && (
                        <span className="ml-1 text-xs">({fileSize(doc.currentFileSize)})</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" title="Baixar revisão atual" onClick={() => download(doc)}>
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Histórico e links" onClick={() => void openDetail(doc)}>
                          <History className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Links" onClick={() => openLinks(doc)}>
                          <Link2 className="h-3.5 w-3.5" />
                        </Button>
                        {canEdit && doc.status === "WIP" && (
                          <Button variant="ghost" size="icon" title="Enviar para análise" onClick={() => void submitForReview(doc)}>
                            <Send className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canApprove && doc.status === "FOR_REVIEW" && (
                          <Button variant="ghost" size="icon" title="Aprovar" onClick={() => openAction(doc, "APPROVE")}>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canApprove && doc.status === "FOR_REVIEW" && (
                          <Button variant="ghost" size="icon" title="Rejeitar" onClick={() => openAction(doc, "REJECT")}>
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canApprove && doc.status === "APPROVED" && (
                          <Button variant="ghost" size="icon" title="Liberar para execução" onClick={() => openAction(doc, "RELEASE")}>
                            <Rocket className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canApprove &&
                          (doc.status === "FOR_REVIEW" || doc.status === "APPROVED" || doc.status === "RELEASED_FOR_EXECUTION") && (
                            <Button variant="ghost" size="icon" title="Marcar obsoleto" onClick={() => openAction(doc, "OBSOLETE")}>
                              <Archive className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        {canEdit &&
                          (doc.status === "APPROVED" || doc.status === "RELEASED_FOR_EXECUTION" || doc.status === "OBSOLETE") && (
                            <Button variant="ghost" size="icon" title="Nova revisão" onClick={() => openRevision(doc)}>
                              <Upload className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        {canEdit && (doc.status === "WIP" || doc.status === "FOR_REVIEW") && (
                          <Button variant="ghost" size="icon" title="Editar metadados" onClick={() => openEdit(doc)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canDelete && (doc.status === "WIP" || doc.status === "FOR_REVIEW" || doc.status === "OBSOLETE") && (
                          <Button variant="ghost" size="icon" title="Excluir" onClick={() => void removeDocument(doc)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {documents.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhum documento. Crie o primeiro documento com upload do arquivo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={createDialog} title="Novo documento (revisão 1)" onClose={() => setCreateDialog(false)} wide>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="doc-code">Código (opcional — automático DOC001…)</Label>
            <Input id="doc-code" value={createForm.code} onChange={(e) => setCreateForm((p) => ({ ...p, code: e.target.value }))} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="doc-title">Título *</Label>
            <Input id="doc-title" value={createForm.title} onChange={(e) => setCreateForm((p) => ({ ...p, title: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="doc-discipline">Disciplina</Label>
              <Input id="doc-discipline" value={createForm.discipline} onChange={(e) => setCreateForm((p) => ({ ...p, discipline: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="doc-classification">Classificação</Label>
              <Input id="doc-classification" value={createForm.classification} onChange={(e) => setCreateForm((p) => ({ ...p, classification: e.target.value }))} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="doc-expiry">Validade (opcional)</Label>
            <Input id="doc-expiry" type="date" value={createForm.expiryDate} onChange={(e) => setCreateForm((p) => ({ ...p, expiryDate: e.target.value }))} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="doc-file">Arquivo (PDF, imagem, Office, texto — máx. 4 MB) *</Label>
            <Input
              id="doc-file"
              type="file"
              onChange={(e) => setCreateForm((p) => ({ ...p, file: e.target.files?.[0] ?? null }))}
            />
            {createForm.file && (
              <p className="text-xs text-muted-foreground">
                {createForm.file.name} ({fileSize(createForm.file.size)})
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCreateDialog(false)}>
              Cancelar
            </Button>
            <Button disabled={busy || !createForm.title || !createForm.file} onClick={() => void submitCreate()}>
              Criar documento
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={editDialog} title="Editar metadados" onClose={() => setEditDialog(false)}>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="edit-title">Título *</Label>
            <Input id="edit-title" value={editForm.title} onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-discipline">Disciplina</Label>
            <Input id="edit-discipline" value={editForm.discipline} onChange={(e) => setEditForm((p) => ({ ...p, discipline: e.target.value }))} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-classification">Classificação</Label>
            <Input id="edit-classification" value={editForm.classification} onChange={(e) => setEditForm((p) => ({ ...p, classification: e.target.value }))} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-expiry">Validade</Label>
            <Input id="edit-expiry" type="date" value={editForm.expiryDate} onChange={(e) => setEditForm((p) => ({ ...p, expiryDate: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditDialog(false)}>
              Cancelar
            </Button>
            <Button disabled={busy || !editForm.title} onClick={() => void submitEdit()}>
              Salvar
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={revisionDialog}
        title={`Nova revisão — ${revisionDoc?.code ?? ""} (atual R${revisionDoc?.currentRevision ?? 0})`}
        onClose={() => setRevisionDialog(false)}
      >
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            A revisão atual permanece no histórico (BR-009 — documento liberado não é sobrescrito).
            O documento volta a rascunho e percorre análise/aprovação/liberação novamente.
          </p>
          <div className="grid gap-2">
            <Label htmlFor="rev-reason">Motivo da revisão *</Label>
            <Input id="rev-reason" value={revisionForm.reason} onChange={(e) => setRevisionForm((p) => ({ ...p, reason: e.target.value }))} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rev-file">Novo arquivo (máx. 4 MB) *</Label>
            <Input id="rev-file" type="file" onChange={(e) => setRevisionForm((p) => ({ ...p, file: e.target.files?.[0] ?? null }))} />
            {revisionForm.file && (
              <p className="text-xs text-muted-foreground">
                {revisionForm.file.name} ({fileSize(revisionForm.file.size)})
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setRevisionDialog(false)}>
              Cancelar
            </Button>
            <Button disabled={busy || !revisionForm.reason || !revisionForm.file} onClick={() => void submitRevision()}>
              Criar revisão
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={actionDialog} title={ACTION_TITLE[actionKind]} onClose={() => setActionDialog(false)}>
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            {actionDoc?.code} — {actionDoc?.title} (R{actionDoc?.currentRevision})
          </p>
          {(actionKind === "APPROVE" || actionKind === "RELEASE") && (
            <div className="grid gap-2">
              <Label htmlFor="action-comment">Comentário (opcional)</Label>
              <Input id="action-comment" value={actionForm.comment} onChange={(e) => setActionForm((p) => ({ ...p, comment: e.target.value }))} />
            </div>
          )}
          {actionKind === "RELEASE" && (
            <div className="grid gap-2">
              <Label htmlFor="action-effective">Data de vigência *</Label>
              <Input id="action-effective" type="date" value={actionForm.effectiveDate} onChange={(e) => setActionForm((p) => ({ ...p, effectiveDate: e.target.value }))} />
            </div>
          )}
          {(actionKind === "REJECT" || actionKind === "OBSOLETE") && (
            <div className="grid gap-2">
              <Label htmlFor="action-reason">Motivo *</Label>
              <Input id="action-reason" value={actionForm.reason} onChange={(e) => setActionForm((p) => ({ ...p, reason: e.target.value }))} />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setActionDialog(false)}>
              Cancelar
            </Button>
            <Button
              disabled={
                busy ||
                ((actionKind === "REJECT" || actionKind === "OBSOLETE") && !actionForm.reason) ||
                (actionKind === "RELEASE" && !actionForm.effectiveDate)
              }
              onClick={() => void submitAction()}
            >
              Confirmar
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={detailDialog} title={`Revisões — ${detail?.code ?? ""}`} onClose={() => setDetailDialog(false)} wide>
        {detailLoading || !detail ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2">Rev.</th>
                    <th className="px-3 py-2">Arquivo</th>
                    <th className="px-3 py-2">Hash SHA-256</th>
                    <th className="px-3 py-2">Motivo</th>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {detail.revisions.map((revision) => (
                    <tr key={revision.id} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-2 font-mono text-xs">R{revision.revision}</td>
                      <td className="px-3 py-2">{revision.fileName}</td>
                      <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                        {revision.hash.slice(0, 12)}…
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{revision.reason ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{revision.createdAt.slice(0, 10)}</td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Baixar esta revisão"
                          onClick={() => downloadRevisionById(detail.id, revision.id)}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={linkDialog} title={`Links — ${linkDoc?.code ?? ""}`} onClose={() => setLinkDialog(false)} wide>
        <div className="flex flex-col gap-3">
          {detail && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2">Relação</th>
                    <th className="px-3 py-2">Alvo</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {detail.links.map((link) => (
                    <tr key={link.id} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-2">
                        <Badge variant="secondary">{link.relationType}</Badge>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {link.targetType}: {link.targetId.slice(0, 8)}…
                      </td>
                      <td className="px-3 py-2 text-right">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Remover link"
                            onClick={() => void removeLink(detail.id, link.id)}
                          >
                            <Unlink className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {detail.links.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">
                        Nenhum link registrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {canEdit && (
            <div className="grid grid-cols-3 gap-2">
              <div className="grid gap-2">
                <Label htmlFor="link-type">Tipo</Label>
                <select
                  id="link-type"
                  className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
                  value={linkForm.targetType}
                  onChange={(e) => setLinkForm((p) => ({ ...p, targetType: e.target.value as TargetTypeKey, targetId: "" }))}
                >
                  {TARGET_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="link-relation">Relação</Label>
                <select
                  id="link-relation"
                  className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
                  value={linkForm.relationType}
                  onChange={(e) => setLinkForm((p) => ({ ...p, relationType: e.target.value }))}
                >
                  {RELATION_OPTIONS.map((relation) => (
                    <option key={relation} value={relation}>
                      {relation}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="link-target">Alvo</Label>
                <select
                  id="link-target"
                  className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
                  value={linkForm.targetId}
                  onChange={(e) => setLinkForm((p) => ({ ...p, targetId: e.target.value }))}
                >
                  <option value="">Selecione…</option>
                  {targetOptions(linkForm.targetType).map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {canEdit && (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setLinkDialog(false)}>
                Fechar
              </Button>
              <Button disabled={busy || !linkForm.targetId} onClick={() => void addLink()}>
                Adicionar link
              </Button>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}
