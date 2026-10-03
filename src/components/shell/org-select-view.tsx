"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";

interface OrgOption {
  organizationId: string;
  name: string;
  slug: string;
  roleCodes: string[];
}

async function activate(organizationId: string): Promise<void> {
  await apiRequest("/api/v1/session/context", {
    method: "POST",
    body: JSON.stringify({ organizationId }),
  });
}

export function OrgSelectView({
  organizations,
  userName,
}: {
  organizations: OrgOption[];
  userName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const enter = async (organizationId: string) => {
    setError(null);
    setBusy(true);
    try {
      await activate(organizationId);
      router.push("/painel");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao ativar organização.");
      setBusy(false);
    }
  };

  const createAndEnter = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await apiRequest<{ organization: { id: string } }>(
        "/api/v1/organizations",
        { method: "POST", body: JSON.stringify({ name: newName }) }
      );
      await activate(result.organization.id);
      router.push("/painel");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao criar organização.");
      setBusy(false);
    }
  };

  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Olá, {userName.split(" ")[0]}</h1>
        <p className="text-sm text-muted-foreground">
          Selecione a organização que deseja acessar.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {organizations.map((org) => (
          <button
            key={org.organizationId}
            type="button"
            disabled={busy}
            onClick={() => void enter(org.organizationId)}
            className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-surface-hover disabled:opacity-60"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Building2 className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{org.name}</div>
              <div className="truncate text-xs text-muted-foreground">/{org.slug}</div>
            </div>
            <div className="flex flex-wrap justify-end gap-1">
              {org.roleCodes.slice(0, 2).map((role) => (
                <Badge key={role} variant="secondary">
                  {role}
                </Badge>
              ))}
            </div>
          </button>
        ))}

        {organizations.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Você ainda não participa de nenhuma organização. Crie a primeira:
          </p>
        )}
      </div>

      <Button variant="outline" onClick={() => setCreateOpen(true)} disabled={busy}>
        <Plus className="h-4 w-4" />
        Criar nova organização
      </Button>

      <Dialog open={createOpen} title="Criar organização" onClose={() => setCreateOpen(false)}>
        <div className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="org-name">Nome *</Label>
            <Input
              id="org-name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Ex: Construtora Alfa"
            />
            <p className="text-xs text-muted-foreground">
              Você será o administrador da nova organização.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void createAndEnter()} disabled={busy || newName.trim().length < 2}>
              {busy ? "Criando…" : "Criar e entrar"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
