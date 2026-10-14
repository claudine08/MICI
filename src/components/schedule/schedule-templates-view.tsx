"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Upload } from "lucide-react";
import type { ScheduleTemplateRow } from "@/modules/schedule/templates";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";

// Templates de cronograma (E07 import, §27): upload de CSV/XML do MS Project
// como cronograma reutilizável. A aplicação acontece pelo diálogo "Importar"
// da página do cronograma (não aqui) — este componente só gerencia os arquivos.

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

export function ScheduleTemplatesView({
  templates,
  canCreate,
  canDelete,
}: {
  templates: ScheduleTemplateRow[];
  canCreate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const openCreate = () => {
    setName("");
    setDescription("");
    setFile(null);
    setError(null);
    setOpen(true);
  };

  const submit = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Informe um nome para o template.");
      return;
    }
    if (!file) {
      setError("Selecione um arquivo CSV ou XML do MS Project.");
      return;
    }
    setBusy(true);
    try {
      const result = await apiRequest<{ template: ScheduleTemplateRow }>(
        "/api/v1/schedule-templates",
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || undefined,
            filename: file.name,
            content: await file.text(),
          }),
        }
      );
      setNotice(
        `Template ${result.template.code} salvo com ${result.template.activityCount} atividades e ` +
          `${result.template.dependencyCount} dependências.`
      );
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar o template.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (template: ScheduleTemplateRow) => {
    if (!window.confirm(`Excluir o template ${template.code} — ${template.name}?`)) return;
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/api/v1/schedule-templates/${template.id}`, { method: "DELETE" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao excluir o template.");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Templates de cronograma (E07 import, §27)</h2>
          <p className="text-xs text-muted-foreground">
            CSV/XML do MS Project salvos como cronograma reutilizável — aplique pelo diálogo
            &ldquo;Importar&rdquo; na página do cronograma do projeto.
          </p>
        </div>
        {canCreate && (
          <Button variant="outline" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Novo template
          </Button>
        )}
      </div>

      <ErrorBox message={error} />
      {notice && (
        <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted-foreground">
          {notice}
        </p>
      )}

      {templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum template de cronograma ainda. Envie um CSV/XML do MS Project para reutilizar o
          cronograma em outros projetos.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-2.5">Código</th>
                <th className="px-4 py-2.5">Nome</th>
                <th className="px-4 py-2.5">Formato</th>
                <th className="px-4 py-2.5">Arquivo</th>
                <th className="px-4 py-2.5">Atividades</th>
                <th className="px-4 py-2.5">Dependências</th>
                <th className="px-4 py-2.5">Criado</th>
                {canDelete && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs">{template.code}</td>
                  <td className="px-4 py-2.5">
                    <span>{template.name}</span>
                    {template.description && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {template.description}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant="secondary">{template.sourceFormat}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {template.sourceFilename ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">{template.activityCount}</td>
                  <td className="px-4 py-2.5">{template.dependencyCount}</td>
                  <td className="px-4 py-2.5">{template.createdAt.slice(0, 10)}</td>
                  {canDelete && (
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        aria-label={`Excluir template ${template.code}`}
                        onClick={() => void remove(template)}
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

      <Dialog open={open} title="Novo template de cronograma" onClose={() => setOpen(false)}>
        <div className="grid gap-3">
          <ErrorBox message={error} />
          <p className="text-sm text-muted-foreground">
            Aceita CSV (separador &quot;;&quot;) ou XML do MS Project. O cronograma é parseado agora e
            salvo como template reutilizável.
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor="st-name">Nome</Label>
            <Input
              id="st-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Cronograma padrão — cozinha industrial"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="st-description">Descrição (opcional)</Label>
            <Input
              id="st-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="st-file">Arquivo (.csv ou .xml)</Label>
            <input
              id="st-file"
              type="file"
              accept=".csv,.xml,text/csv,application/xml,text/xml"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
            {file && <p className="text-xs text-muted-foreground">{file.name}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void submit()} disabled={busy}>
              <Upload className="h-4 w-4" />
              {busy ? "Salvando…" : "Salvar template"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
