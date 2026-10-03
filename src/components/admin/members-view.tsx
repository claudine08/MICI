"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, KeyRound } from "lucide-react";
import type { MemberRow } from "@/modules/identity/selectors";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";

interface RoleOption {
  code: string;
  name: string;
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{message}</p>;
}

function RoleChecklist({
  roles,
  selected,
  onChange,
}: {
  roles: RoleOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  return (
    <div className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto rounded-md border border-border p-3">
      {roles.map((role) => (
        <label key={role.code} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={selected.has(role.code)}
            onChange={(event) => {
              const next = new Set(selected);
              if (event.target.checked) next.add(role.code);
              else next.delete(role.code);
              onChange(next);
            }}
          />
          <span className="truncate" title={role.code}>
            {role.name}
          </span>
        </label>
      ))}
    </div>
  );
}

export function MembersView({
  members,
  roles,
  canCreate,
  canEdit,
}: {
  members: MemberRow[];
  roles: RoleOption[];
  canCreate: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRoles, setInviteRoles] = useState<Set<string>>(new Set());
  const [generated, setGenerated] = useState<string | null>(null);

  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [editRoles, setEditRoles] = useState<Set<string>>(new Set());
  const [editStatus, setEditStatus] = useState<"ACTIVE" | "SUSPENDED">("ACTIVE");

  const resetInvite = () => {
    setInviteEmail("");
    setInviteName("");
    setInvitePassword("");
    setInviteRoles(new Set());
    setError(null);
  };

  const submitInvite = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await apiRequest<{ member: { generatedPassword?: string | null } }>(
        "/api/v1/members",
        {
          method: "POST",
          body: JSON.stringify({
            email: inviteEmail,
            name: inviteName || undefined,
            temporaryPassword: invitePassword || undefined,
            roleCodes: [...inviteRoles],
          }),
        }
      );
      setInviteOpen(false);
      resetInvite();
      if (result.member.generatedPassword) setGenerated(result.member.generatedPassword);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao convidar.");
    } finally {
      setBusy(false);
    }
  };

  const submitEdit = async () => {
    if (!editing) return;
    setError(null);
    setBusy(true);
    try {
      await apiRequest(`/api/v1/members/${editing.membershipId}`, {
        method: "PATCH",
        body: JSON.stringify({ roleCodes: [...editRoles], status: editStatus }),
      });
      setEditing(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao atualizar.");
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (member: MemberRow) => {
    if (!window.confirm(`Remover ${member.name} desta organização?`)) return;
    setError(null);
    try {
      await apiRequest(`/api/v1/members/${member.membershipId}`, { method: "DELETE" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao remover.");
    }
  };

  const openEdit = (member: MemberRow) => {
    setEditing(member);
    setEditRoles(new Set(member.roleCodes));
    setEditStatus(member.membershipStatus === "ACTIVE" ? "ACTIVE" : "SUSPENDED");
    setError(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {members.length} membro{members.length === 1 ? "" : "s"} · convites criam o usuário com
          senha temporária (sem serviço de e-mail no MVP).
        </p>
        {canCreate && (
          <Button
            onClick={() => {
              resetInvite();
              setInviteOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Convidar membro
          </Button>
        )}
      </div>

      <ErrorBox message={error} />

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="px-4 py-2.5">Nome</th>
              <th className="px-4 py-2.5">E-mail</th>
              <th className="px-4 py-2.5">Papéis</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Último acesso</th>
              {canEdit && <th className="px-4 py-2.5 text-right">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.membershipId} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5 font-medium">{member.name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{member.email}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {member.roleCodes.map((code) => (
                      <Badge key={code} variant="secondary">
                        {code}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  {member.membershipStatus === "ACTIVE" ? (
                    <Badge variant="success">Ativo</Badge>
                  ) : (
                    <Badge variant="warning">Suspenso</Badge>
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {member.lastLoginAt ? dateFormatter.format(member.lastLoginAt) : "—"}
                </td>
                {canEdit && (
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Editar papéis/status"
                        onClick={() => openEdit(member)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Remover membro"
                        onClick={() => void removeMember(member)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum membro encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={inviteOpen} title="Convidar membro" onClose={() => setInviteOpen(false)} wide>
        <div className="flex flex-col gap-4">
          <ErrorBox message={error} />
          <div className="grid gap-2">
            <Label htmlFor="invite-email">E-mail *</Label>
            <Input
              id="invite-email"
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="pessoa@empresa.com"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-name">Nome (opcional)</Label>
            <Input
              id="invite-name"
              value={inviteName}
              onChange={(event) => setInviteName(event.target.value)}
              placeholder="Nome completo"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-password">Senha temporária (opcional)</Label>
            <Input
              id="invite-password"
              value={invitePassword}
              onChange={(event) => setInvitePassword(event.target.value)}
              placeholder="Em branco = gerada automaticamente"
            />
            <p className="text-xs text-muted-foreground">
              Mín. 8 caracteres com letra e dígito. O usuário deve trocar após o primeiro acesso.
            </p>
          </div>
          <div className="grid gap-2">
            <Label>Papéis *</Label>
            <RoleChecklist roles={roles} selected={inviteRoles} onChange={setInviteRoles} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void submitInvite()}
              disabled={
                busy ||
                !inviteEmail ||
                inviteRoles.size === 0 ||
                (invitePassword.length > 0 &&
                  (invitePassword.length < 8 ||
                    !/[A-Za-z]/.test(invitePassword) ||
                    !/\d/.test(invitePassword)))
              }
            >
              {busy ? "Convidando…" : "Convidar"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={!!generated}
        title="Credenciais geradas"
        onClose={() => setGenerated(null)}
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Compartilhe a senha temporária com o usuário fora do sistema:
          </p>
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm">
            <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 break-all">{generated}</span>
          </div>
          <Button variant="outline" onClick={() => setGenerated(null)}>
            Entendi
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={!!editing}
        title={editing ? `Editar ${editing.name}` : ""}
        onClose={() => setEditing(null)}
      >
        <div className="flex flex-col gap-4">
          <ErrorBox message={error} />
          <div className="grid gap-2">
            <Label>Papéis</Label>
            <RoleChecklist roles={roles} selected={editRoles} onChange={setEditRoles} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-status">Status da membresia</Label>
            <select
              id="edit-status"
              value={editStatus}
              onChange={(event) => setEditStatus(event.target.value as "ACTIVE" | "SUSPENDED")}
              className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
            >
              <option value="ACTIVE">Ativo</option>
              <option value="SUSPENDED">Suspenso</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void submitEdit()} disabled={busy || editRoles.size === 0}>
              {busy ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
