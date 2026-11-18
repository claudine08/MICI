"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import type { WbsNodeRow } from "@/modules/wbs/selectors";
import { WBS_NODE_TYPE_LABELS, type WbsNodeTypeValue } from "@/modules/wbs/engine";
import { Button } from "@/components/ui/button";

interface Props {
  tree: WbsNodeRow[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onAdd: (parentId: string | null) => void;
  onEdit: (node: WbsNodeRow) => void;
  onRemove: (node: WbsNodeRow) => void;
}

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(value: Date | null) {
  return value ? new Date(value).toLocaleDateString("pt-BR") : "—";
}

function NodeBox({
  node,
  canCreate,
  canEdit,
  canDelete,
  onAdd,
  onEdit,
  onRemove,
}: {
  node: WbsNodeRow;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onAdd: (parentId: string | null) => void;
  onEdit: (node: WbsNodeRow) => void;
  onRemove: (node: WbsNodeRow) => void;
}) {
  const [open, setOpen] = useState(true);
  const hasChildren = (node.children?.length ?? 0) > 0;

  return (
    <div className="flex flex-col items-center">
      <div className="group relative">
        <div className="w-44 rounded-lg border border-border bg-surface p-2 shadow-sm text-xs">
          <div className="font-mono text-[10px] text-muted-foreground">{node.path}</div>
          <div className="font-semibold leading-tight">
            {node.linkedActivityLabel ?? node.name}
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            {WBS_NODE_TYPE_LABELS[node.nodeType as WbsNodeTypeValue] ?? node.nodeType}
          </div>
          {node.requirementsCount > 0 && (
            <div className="text-[10px] text-muted-foreground">
              {node.requirementsCount} req.
            </div>
          )}
          <div className="mt-1 text-[10px] text-muted-foreground">
            P: {fmtDate(node.plannedStart)} → {fmtDate(node.plannedFinish)}
          </div>
          <div className="text-[10px] text-muted-foreground">
            R: {fmtDate(node.actualStart)} → {fmtDate(node.actualFinish)}
          </div>
        </div>

        <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-56 -translate-x-1/2 rounded-md border border-border bg-popover p-2 text-xs shadow-lg group-hover:block">
          <div className="font-semibold mb-1">Recursos / custos / riscos</div>
          <div className="mb-1">
            <span className="font-medium">Recursos:</span>{" "}
            {node.linkedActivityLabel ? node.linkedActivityLabel : "—"}
          </div>
          <div className="mb-1">
            <span className="font-medium">Custos:</span> {money(node.costTotal)}
          </div>
          <div className="mb-1">
            <span className="font-medium">Plan.:</span> {fmtDate(node.plannedStart)} → {fmtDate(node.plannedFinish)}
          </div>
          <div className="mb-1">
            <span className="font-medium">Real:</span> {fmtDate(node.actualStart)} → {fmtDate(node.actualFinish)}
          </div>
          <div>
            <span className="font-medium">Riscos:</span>{" "}
            {node.riskTitles.length > 0 ? node.riskTitles.join("; ") : "—"}
          </div>
        </div>

        <div className="absolute -right-2 -top-2 hidden gap-1 group-hover:flex">
          {canCreate && (
            <Button
              size="icon"
              variant="secondary"
              className="h-6 w-6"
              title="Adicionar filho"
              onClick={() => onAdd(node.id)}
            >
              <Plus className="h-3 w-3" />
            </Button>
          )}
          {canEdit && (
            <Button
              size="icon"
              variant="secondary"
              className="h-6 w-6"
              title="Editar"
              onClick={() => onEdit(node)}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
          {canDelete && (
            <Button
              size="icon"
              variant="destructive"
              className="h-6 w-6"
              title="Excluir"
              onClick={() => onRemove(node)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {hasChildren && (
        <button
          type="button"
          className="mt-1 text-muted-foreground"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Recolher" : "Expandir"}
        >
          {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      )}

      {hasChildren && open && (
        <>
          <div className="h-4 w-px bg-border" />
          <div className="flex gap-6">
            {(node.children as WbsNodeRow[]).map((child) => (
              <div key={child.id} className="flex flex-col items-center">
                <div className="h-4 w-px bg-border" />
                <NodeBox
                  node={child}
                  canCreate={canCreate}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  onAdd={onAdd}
                  onEdit={onEdit}
                  onRemove={onRemove}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function WbsGraph({ tree, canCreate, canEdit, canDelete, onAdd, onEdit, onRemove }: Props) {
  if (tree.length === 0) {
    return <p className="text-sm text-muted-foreground">Árvore vazia.</p>;
  }
  return (
    <div className="flex min-h-full items-center justify-center overflow-x-auto rounded-lg border border-border bg-surface p-4">
      <div className="flex gap-8 justify-center min-w-max">
        {tree.map((node) => (
          <NodeBox
            key={node.id}
            node={node}
            canCreate={canCreate}
            canEdit={canEdit}
            canDelete={canDelete}
            onAdd={onAdd}
            onEdit={onEdit}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  );
}
