"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Star } from "lucide-react";
import type { TemplateRow } from "@/modules/portfolio/selectors";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

interface TemplateForm {
  code: string;
  name: string;
  description: string;
  isDefault: boolean;
}

const emptyForm: TemplateForm = { code: "", name: "", description: "", isDefault: false };

export function TemplatesView({
  templates,
  canCreate,
  canEdit,
  canDelete,
}: {
  templates: TemplateRow[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateForm>(emptyForm);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = (template: TemplateRow) => {
    setEditingId(template.id);
    setForm({
      code: template.code,
      name: template.name,
      description: template.description ?? "",
      isDefault: template.isDefault,
    });
    setError(null);
    setDialogOpen(true);
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const payload = {
        code: form.code,
        name: form.name,
        description: form.description,
        isDefault: form.isDefault,
      };
      if (editingId) {
        await apiRequest(`/api/v1/project-templates/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest("/api/v1/project-templates", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setDialogOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar template.");
    } finally {
      setBusy(false);
    }
  };

  const removeTemplate = async (template: TemplateRow) => {
    if (!window.confirm(`Remover o template ${template.name}?`)) return;
    setError(null);
    try {
      await apiRequest(`/api/v1/project-templates/${template.id}`, { method: "DELETE" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao remover.");
    }
  };

  const set = (key: keyof TemplateForm, value: string | boolean) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {templates.length} template{templates.length === 1 ? "" : "s"} · o template padrão
          pré-seleciona na criação de projetos.
        </p>
        {canCreate && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Novo template
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
              <th className="px-4 py-2.5">Descrição</th>
              <th className="px-4 py-2.5">Projetos</th>
              {(canEdit || canDelete) && <th className="px-4 py-2.5 text-right">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr key={template.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5 font-mono text-xs">{template.code}</td>
                <td className="px-4 py-2.5 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    {template.name}
                    {template.isDefault && (
                      <Badge variant="default" title="Template padrão">
                        <Star className="mr-0.5 h-2.5 w-2.5" />
                        Padrão
                      </Badge>
                    )}
                  </span>
                </td>
                <td className="max-w-md truncate px-4 py-2.5 text-muted-foreground">
                  {template.description ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{template.projectCount}</td>
                {(canEdit || canDelete) && (
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Editar template"
                          onClick={() => openEdit(template)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Remover template"
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
            {templates.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum template cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={dialogOpen}
        title={editingId ? "Editar template" : "Novo template"}
        onClose={() => setDialogOpen(false)}
      >
        <div className="flex flex-col gap-4">
          <ErrorBox message={error} />
          <div className="grid gap-2">
            <Label htmlFor="template-code">Código *</Label>
            <Input
              id="template-code"
              value={form.code}
              onChange={(event) => set("code", event.target.value.toUpperCase())}
              placeholder="MICI-PADRAO"
              disabled={!!editingId}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="template-name">Nome *</Label>
            <Input
              id="template-name"
              value={form.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="Nome do template"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="template-description">Descrição</Label>
            <textarea
              id="template-description"
              value={form.description}
              onChange={(event) => set("description", event.target.value)}
              rows={3}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(event) => set("isDefault", event.target.checked)}
            />
            Usar como template padrão
          </label>
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
