"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, X } from "lucide-react";
import type { RoleRow, PermissionRow } from "@/modules/identity/selectors";
import { ACTIONS, permissionCode, type Module } from "@/core/rbac";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";

function modulesFromCatalog(catalog: PermissionRow[]): Module[] {
  const seen: string[] = [];
  for (const permission of catalog) {
    if (!seen.includes(permission.module)) seen.push(permission.module);
  }
  return seen as Module[];
}

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

function PermissionMatrix({
  modules,
  selected,
  editable,
  onToggle,
}: {
  modules: Module[];
  selected: ReadonlySet<string>;
  editable: boolean;
  onToggle?: (code: string, checked: boolean) => void;
}) {
  return (
    <div className="max-h-80 overflow-auto rounded-md border border-border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Módulo</th>
            {ACTIONS.map((action) => (
              <th key={action} className="px-2 py-2 text-center" title={action}>
                {action}
              </th>
            ))}
            {editable && <th className="px-2 py-2 text-center">Todas</th>}
          </tr>
        </thead>
        <tbody>
          {modules.map((module) => {
            const rowCodes = ACTIONS.map((action) => permissionCode(module, action));
            const allChecked = rowCodes.every((code) => selected.has(code));
            return (
              <tr key={module} className="border-t border-border">
                <td className="px-3 py-1.5 font-medium">{module}</td>
                {ACTIONS.map((action) => {
                  const code = permissionCode(module, action);
                  const checked = selected.has(code);
                  if (!editable) {
                    return (
                      <td key={action} className="px-2 py-1.5 text-center">
                        {checked ? (
                          <Check className="mx-auto h-3.5 w-3.5 text-success" />
                        ) : (
                          <X className="mx-auto h-3.5 w-3.5 text-muted-foreground/40" />
                        )}
                      </td>
                    );
                  }
                  return (
                    <td key={action} className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${module}:${action}`}
                        checked={checked}
                        onChange={(event) => onToggle?.(code, event.target.checked)}
                      />
                    </td>
                  );
                })}
                {editable && (
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      aria-label={`Todas as ações de ${module}`}
                      checked={allChecked}
                      onChange={(event) =>
                        rowCodes.forEach((code) => onToggle?.(code, event.target.checked))
                      }
                    />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RolesView({
  roles,
  catalog,
  canCreate,
}: {
  roles: RoleRow[];
  catalog: PermissionRow[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const modules = modulesFromCatalog(catalog);

  const [viewRole, setViewRole] = useState<RoleRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (permCode: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(permCode);
      else next.delete(permCode);
      return next;
    });
  };

  const openCreate = () => {
    setCode("");
    setName("");
    setDescription("");
    setSelected(new Set());
    setError(null);
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    setError(null);
    setBusy(true);
    try {
      await apiRequest("/api/v1/roles", {
        method: "POST",
        body: JSON.stringify({
          code,
          name,
          description: description || undefined,
          permissionCodes: [...selected],
        }),
      });
      setCreateOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao criar papel.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {roles.length} papéis · 18 papéis do sistema são imutáveis; customizados são criados
          aqui (E02-US03/US04).
        </p>
        {canCreate && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Novo papel
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {roles.map((role) => (
          <div
            key={role.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold text-primary">{role.code}</span>
              {role.isSystem ? (
                <Badge variant="secondary">Sistema</Badge>
              ) : (
                <Badge variant="default">Custom</Badge>
              )}
            </div>
            <div className="text-sm font-medium">{role.name}</div>
            {role.description && (
              <p className="text-xs text-muted-foreground">{role.description}</p>
            )}
            <div className="mt-auto flex items-center justify-between pt-2 text-xs text-muted-foreground">
              <span>
                {role.memberCount} membro{role.memberCount === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => setViewRole(role)}
              >
                {role.permissionCodes.length} permissões →
              </button>
            </div>
          </div>
        ))}
      </div>

      <Dialog
        open={!!viewRole}
        title={viewRole ? `${viewRole.name} (${viewRole.code})` : ""}
        onClose={() => setViewRole(null)}
        wide
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {viewRole?.permissionCodes.length} permissões concedidas.
          </p>
          <PermissionMatrix
            modules={modules}
            selected={new Set(viewRole?.permissionCodes ?? [])}
            editable={false}
          />
        </div>
      </Dialog>

      <Dialog open={createOpen} title="Novo papel" onClose={() => setCreateOpen(false)} wide>
        <div className="flex flex-col gap-4">
          <ErrorBox message={error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="role-code">Código *</Label>
              <Input
                id="role-code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="EX: ANALISTA"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role-name">Nome *</Label>
              <Input
                id="role-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Analista de Projetos"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="role-description">Descrição</Label>
            <Input
              id="role-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="O que este papel faz"
            />
          </div>
          <div className="grid gap-2">
            <Label>
              Permissões * <span className="text-muted-foreground">({selected.size} marcadas)</span>
            </Label>
            <PermissionMatrix modules={modules} selected={selected} editable onToggle={toggle} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void submitCreate()}
              disabled={busy || !code || !name || selected.size === 0}
            >
              {busy ? "Criando…" : "Criar papel"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
