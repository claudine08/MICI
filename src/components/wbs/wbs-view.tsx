"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FilePlus2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  GitCommitVertical,
} from "lucide-react";
import type { WbsNodeRow, WbsVersionRow } from "@/modules/wbs/selectors";
import { WBS_NODE_TYPE_LABELS, type WbsNodeTypeValue } from "@/modules/wbs/engine";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";

// Árvore de WBS (E05-US01…US05): criar, editar/mover, reordenar, duplicar,
// excluir, importar/exportar e versionar — com relatório de erros da importação.

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

interface FlatRow {
  node: WbsNodeRow;
  siblings: WbsNodeRow[];
  index: number;
  depth: number;
}

function flattenTree(nodes: WbsNodeRow[], depth: number, rows: FlatRow[] = []): FlatRow[] {
  nodes.forEach((node, index) => {
    rows.push({ node, siblings: nodes, index, depth });
    // requirementsCount é propagado pelo buildWbsTree, mas o tipo declara o
    // campo apenas no nível raiz (WbsNodeRow).
    flattenTree(node.children as WbsNodeRow[], depth + 1, rows);
  });
  return rows;
}

interface NodeForm {
  name: string;
  description: string;
  nodeType: string;
  parentId: string;
}

const emptyForm: NodeForm = { name: "", description: "", nodeType: "WORK_PACKAGE", parentId: "" };

export function WbsView({
  projectId,
  tree,
  versions,
  canCreate,
  canEdit,
  canDelete,
}: {
  projectId: string;
  tree: WbsNodeRow[];
  versions: WbsVersionRow[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const rows = useMemo(() => flattenTree(tree, 0), [tree]);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"node" | "import" | "versions" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<NodeForm>(emptyForm);
  const [importPayload, setImportPayload] = useState("");
  const [versionNote, setVersionNote] = useState("");

  const set = (key: keyof NodeForm, value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const run = async (message: string, request: () => Promise<unknown>) => {
    setError(null);
    try {
      await request();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : message);
    }
  };

  const openCreate = (parentId: string | null) => {
    setEditingId(null);
    setForm({ ...emptyForm, parentId: parentId ?? "" });
    setError(null);
    setDialog("node");
  };

  const openEdit = (node: WbsNodeRow) => {
    setEditingId(node.id);
    setForm({
      name: node.name,
      description: node.description ?? "",
      nodeType: node.nodeType ?? "WORK_PACKAGE",
      parentId: node.parentId ?? "",
    });
    setError(null);
    setDialog("node");
  };

  const subtreeIds = useMemo(() => {
    if (!editingId) return new Set<string>();
    const ids = new Set<string>([editingId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const row of rows) {
        if (row.node.parentId && ids.has(row.node.parentId) && !ids.has(row.node.id)) {
          ids.add(row.node.id);
          grew = true;
        }
      }
    }
    return ids;
  }, [editingId, rows]);

  const submitNode = async () => {
    setError(null);
    try {
      const payload = {
        name: form.name,
        description: form.description || undefined,
        nodeType: form.nodeType,
        parentId: form.parentId || null,
      };
      if (editingId) {
        await apiRequest(`/api/v1/wbs/nodes/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest(`/api/v1/projects/${projectId}/wbs`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setDialog(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar nó.");
    }
  };

  const move = async (row: FlatRow, delta: number) => {
    const target = row.index + delta;
    if (target < 0 || target >= row.siblings.length) return;
    const ordered = [...row.siblings];
    [ordered[row.index], ordered[target]] = [ordered[target], ordered[row.index]];
    await run("Falha ao reordenar.", () =>
      apiRequest(`/api/v1/projects/${projectId}/wbs/reorder`, {
        method: "POST",
        body: JSON.stringify({
          parentId: row.node.parentId,
          orderedIds: ordered.map((node) => node.id),
        }),
      })
    );
  };

  const duplicate = (node: WbsNodeRow) =>
    run("Falha ao duplicar.", () =>
      apiRequest(`/api/v1/wbs/nodes/${node.id}/duplicate`, { method: "POST", body: "{}" })
    );

  const remove = async (node: WbsNodeRow) => {
    if (!window.confirm(`Excluir o nó ${node.code} — ${node.name}?`)) return;
    await run("Falha ao excluir.", () =>
      apiRequest(`/api/v1/wbs/nodes/${node.id}`, { method: "DELETE" })
    );
  };

  const submitImport = async () => {
    setError(null);
    try {
      const parsed: unknown = JSON.parse(importPayload);
      const nodes = Array.isArray(parsed) ? parsed : (parsed as { nodes?: unknown }).nodes;
      if (!Array.isArray(nodes)) {
        throw new Error('Payload inválido: use {"nodes": [...]} ou uma lista de nós.');
      }
      await apiRequest(`/api/v1/projects/${projectId}/wbs/import`, {
        method: "POST",
        body: JSON.stringify({ nodes, note: "Importação manual" }),
      });
      setDialog(null);
      setImportPayload("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao importar.");
    }
  };

  const createVersion = async () => {
    setDialog("versions");
    setError(null);
  };

  const confirmVersion = async () => {
    setError(null);
    try {
      await apiRequest(`/api/v1/projects/${projectId}/wbs/versions`, {
        method: "POST",
        body: JSON.stringify({ note: versionNote || undefined }),
      });
      setVersionNote("");
      setDialog(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar versão.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {rows.length} nó{rows.length === 1 ? "" : "s"} · profundidade máxima 12 níveis;
          importação valida e reporta erros por linha (§0.1 regra 18).
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => window.open(`/api/v1/projects/${projectId}/wbs/export?format=json`, "_blank")}
          >
            <Download className="h-4 w-4" />
            JSON
          </Button>
          <Button
            variant="outline"
            onClick={() => window.open(`/api/v1/projects/${projectId}/wbs/export?format=csv`, "_blank")}
          >
            <Download className="h-4 w-4" />
            CSV
          </Button>
          {canEdit && (
            <Button variant="outline" onClick={() => setDialog("import")}>
              <Upload className="h-4 w-4" />
              Importar
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" onClick={() => void createVersion()}>
              <GitCommitVertical className="h-4 w-4" />
              Nova versão
            </Button>
          )}
          {canCreate && (
            <Button onClick={() => openCreate(null)}>
              <Plus className="h-4 w-4" />
              Novo nó raiz
            </Button>
          )}
        </div>
      </div>

      <ErrorBox message={error} />

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="px-4 py-2.5">Código</th>
              <th className="px-4 py-2.5">Nome</th>
              <th className="px-4 py-2.5">Tipo</th>
              <th className="px-4 py-2.5">Req.</th>
              <th className="px-4 py-2.5 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.node.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-mono text-xs" style={{ paddingLeft: 16 + row.depth * 20 }}>
                  {row.node.path}
                </td>
                <td className="px-4 py-2 font-medium">{row.node.name}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {WBS_NODE_TYPE_LABELS[row.node.nodeType as WbsNodeTypeValue] ??
                    row.node.nodeType}
                </td>
                <td className="px-4 py-2 text-muted-foreground">{row.node.requirementsCount}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-1">
                    {canEdit && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Subir"
                          disabled={row.index === 0}
                          onClick={() => void move(row, -1)}
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Descer"
                          disabled={row.index === row.siblings.length - 1}
                          onClick={() => void move(row, 1)}
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Editar / mover"
                          onClick={() => openEdit(row.node)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    {canCreate && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Adicionar filho"
                          onClick={() => openCreate(row.node.id)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Duplicar subárvore"
                          onClick={() => void duplicate(row.node)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Excluir nó"
                        onClick={() => void remove(row.node)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Árvore vazia. Crie o primeiro nó ou importe uma WBS existente.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={dialog === "node"}
        title={editingId ? "Editar nó" : "Novo nó"}
        onClose={() => setDialog(null)}
      >
        <div className="flex flex-col gap-4">
          <ErrorBox message={error} />
          <div className="grid gap-2">
            <Label htmlFor="wbs-name">Nome *</Label>
            <Input
              id="wbs-name"
              value={form.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="Levantamento"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="wbs-type">Tipo</Label>
            <select
              id="wbs-type"
              value={form.nodeType}
              onChange={(event) => set("nodeType", event.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              {Object.entries(WBS_NODE_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="wbs-parent">Pai (mover)</Label>
            <select
              id="wbs-parent"
              value={form.parentId}
              onChange={(event) => set("parentId", event.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">Raiz do projeto</option>
              {rows
                .filter((row) => !subtreeIds.has(row.node.id))
                .map((row) => (
                  <option key={row.node.id} value={row.node.id}>
                    {row.node.path} — {row.node.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="wbs-description">Descrição</Label>
            <textarea
              id="wbs-description"
              rows={3}
              value={form.description}
              onChange={(event) => set("description", event.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void submitNode()} disabled={!form.name.trim()}>
              Salvar
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={dialog === "import"} title="Importar WBS" onClose={() => setDialog(null)} wide>
        <div className="flex flex-col gap-4">
          <ErrorBox message={error} />
          <p className="text-sm text-muted-foreground">
            Cole o JSON no formato <code>{'{"nodes": [{"code": "1", "name": "…"}]}'}</code> ou uma
            lista de nós. A importação é um merge por código: nós ausentes são mantidos e o payload
            original fica preservado na versão IMPORT.
          </p>
          <textarea
            rows={12}
            value={importPayload}
            onChange={(event) => setImportPayload(event.target.value)}
            placeholder='{"nodes": [{"code": "1", "name": "Projeto"}, {"code": "1.1", "name": "Levantamento", "parentCode": "1"}]}'
            className="rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void submitImport()} disabled={!importPayload.trim()}>
              <FilePlus2 className="h-4 w-4" />
              Importar
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={dialog === "versions"}
        title="Versões da WBS"
        onClose={() => setDialog(null)}
        wide
      >
        <div className="flex flex-col gap-4">
          <ErrorBox message={error} />
          <div className="grid gap-2">
            <Label htmlFor="wbs-version-note">Nota da nova versão (opcional)</Label>
            <Input
              id="wbs-version-note"
              value={versionNote}
              onChange={(event) => setVersionNote(event.target.value)}
              placeholder="Baseline aprovada em reunião"
            />
            <div className="flex justify-end">
              <Button onClick={() => void confirmVersion()}>
                <GitCommitVertical className="h-4 w-4" />
                Criar versão
              </Button>
            </div>
          </div>
          <ul className="flex flex-col gap-2">
            {versions.map((version) => (
              <li
                key={version.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span>
                  v{version.version} · {version.source === "IMPORT" ? "Importação" : "Manual"} ·{" "}
                  {version.nodeCount} nós
                  {version.note ? ` · ${version.note}` : ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(version.createdAt).toLocaleDateString("pt-BR")}
                </span>
              </li>
            ))}
            {versions.length === 0 && (
              <li className="text-sm text-muted-foreground">Nenhuma versão registrada.</li>
            )}
          </ul>
        </div>
      </Dialog>
    </div>
  );
}
