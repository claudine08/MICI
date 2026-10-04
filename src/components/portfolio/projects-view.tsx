"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, ArrowRight } from "lucide-react";
import type { ProjectRow } from "@/modules/portfolio/selectors";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { PROJECT_STATUS_LABELS, phaseName } from "./labels";

interface Option {
  id: string;
  name: string;
}

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

const STATUS_OPTIONS = [
  ["DRAFT", "Rascunho"],
  ["QUALIFICATION", "Qualificação"],
  ["ACTIVE", "Ativo"],
  ["ON_HOLD", "Suspenso"],
  ["COMPLETED", "Concluído"],
  ["CANCELLED", "Cancelado"],
  ["ARCHIVED", "Arquivado"],
] as const;

interface ProjectForm {
  code: string;
  name: string;
  description: string;
  clientId: string;
  projectTemplateId: string;
  projectType: string;
  location: string;
  status: string;
  startDate: string;
  plannedEndDate: string;
}

const emptyForm: ProjectForm = {
  code: "",
  name: "",
  description: "",
  clientId: "",
  projectTemplateId: "",
  projectType: "",
  location: "",
  status: "DRAFT",
  startDate: "",
  plannedEndDate: "",
};

export function ProjectsView({
  projects,
  clients,
  templates,
  canCreate,
  canEdit,
}: {
  projects: ProjectRow[];
  clients: Option[];
  templates: Option[];
  canCreate: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProjectForm>(emptyForm);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = async (project: ProjectRow) => {
    setError(null);
    try {
      const data = await apiRequest<{ project: Record<string, string | null> }>(
        `/api/v1/projects/${project.id}`
      );
      const detail = data.project;
      setEditingId(detail.id!);
      setForm({
        code: detail.code!,
        name: detail.name!,
        description: detail.description ?? "",
        clientId: detail.clientId ?? "",
        projectTemplateId: detail.projectTemplateId ?? "",
        projectType: detail.projectType ?? "",
        location: detail.location ?? "",
        status: detail.status!,
        startDate: detail.startDate ? String(detail.startDate).slice(0, 10) : "",
        plannedEndDate: detail.plannedEndDate
          ? String(detail.plannedEndDate).slice(0, 10)
          : "",
      });
      setDialogOpen(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao carregar projeto.");
    }
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const payload = {
        code: form.code,
        name: form.name,
        description: form.description,
        clientId: form.clientId || null,
        projectTemplateId: form.projectTemplateId || null,
        projectType: form.projectType,
        location: form.location,
        status: form.status,
        startDate: form.startDate || null,
        plannedEndDate: form.plannedEndDate || null,
      };
      if (editingId) {
        await apiRequest(`/api/v1/projects/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest("/api/v1/projects", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setDialogOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar projeto.");
    } finally {
      setBusy(false);
    }
  };

  const removeProject = async (project: ProjectRow) => {
    if (!window.confirm(`Remover o projeto ${project.code} — ${project.name}?`)) return;
    setError(null);
    try {
      await apiRequest(`/api/v1/projects/${project.id}`, { method: "DELETE" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao remover.");
    }
  };

  const set = (key: keyof ProjectForm, value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {projects.length} projeto{projects.length === 1 ? "" : "s"} · gates obrigatórios
          bloqueiam o avanço de fase (BR-001).
        </p>
        {canCreate && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Novo projeto
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
              <th className="px-4 py-2.5">Cliente</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Fase</th>
              <th className="px-4 py-2.5">Gates</th>
              {(canEdit || canCreate) && <th className="px-4 py-2.5 text-right">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => {
              const status = PROJECT_STATUS_LABELS[project.status] ?? {
                label: project.status,
                variant: "secondary" as const,
              };
              return (
                <tr key={project.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs">{project.code}</td>
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      className="font-medium hover:text-primary hover:underline"
                      onClick={() => router.push(`/projetos/${project.id}`)}
                    >
                      {project.name}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {project.clientName ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline" title={phaseName(project.currentPhase) ?? ""}>
                      {project.currentPhase}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {project.gates.approved}/{project.gates.total}
                    {project.gates.pending > 0 && (
                      <span className="ml-1 text-xs text-warning">({project.gates.pending})</span>
                    )}
                  </td>
                  {(canEdit || canCreate) && (
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Abrir projeto"
                          onClick={() => router.push(`/projetos/${project.id}`)}
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                        {canEdit && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Editar projeto"
                              onClick={() => openEdit(project)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Remover projeto"
                              onClick={() => void removeProject(project)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {projects.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum projeto encontrado. Crie o primeiro projeto para começar o portfólio.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={dialogOpen}
        title={editingId ? "Editar projeto" : "Novo projeto"}
        onClose={() => setDialogOpen(false)}
        wide
      >
        <div className="flex flex-col gap-4">
          <ErrorBox message={error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="project-code">Código *</Label>
              <Input
                id="project-code"
                value={form.code}
                onChange={(event) => set("code", event.target.value.toUpperCase())}
                placeholder="EX-001"
                disabled={!!editingId}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project-name">Nome *</Label>
              <Input
                id="project-name"
                value={form.name}
                onChange={(event) => set("name", event.target.value)}
                placeholder="Nome do projeto"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project-client">Cliente</Label>
              <select
                id="project-client"
                value={form.clientId}
                onChange={(event) => set("clientId", event.target.value)}
                className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
              >
                <option value="">— Sem cliente —</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project-template">Template</Label>
              <select
                id="project-template"
                value={form.projectTemplateId}
                onChange={(event) => set("projectTemplateId", event.target.value)}
                className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
              >
                <option value="">— Sem template —</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project-type">Tipo</Label>
              <Input
                id="project-type"
                value={form.projectType}
                onChange={(event) => set("projectType", event.target.value)}
                placeholder="Nova / Reforma / Expansão…"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project-location">Localização</Label>
              <Input
                id="project-location"
                value={form.location}
                onChange={(event) => set("location", event.target.value)}
                placeholder="Cidade, UF"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project-status">Status</Label>
              <select
                id="project-status"
                value={form.status}
                onChange={(event) => set("status", event.target.value)}
                className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
              >
                {STATUS_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project-start">Início</Label>
              <Input
                id="project-start"
                type="date"
                value={form.startDate}
                onChange={(event) => set("startDate", event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project-end">Fim planejado</Label>
              <Input
                id="project-end"
                type="date"
                value={form.plannedEndDate}
                onChange={(event) => set("plannedEndDate", event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="project-description">Descrição</Label>
            <textarea
              id="project-description"
              value={form.description}
              onChange={(event) => set("description", event.target.value)}
              rows={3}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void submit()} disabled={busy || !form.code || !form.name}>
              {busy ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
