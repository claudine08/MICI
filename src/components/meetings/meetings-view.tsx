"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { MeetingRow } from "@/modules/meetings/selectors";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";

interface Member { id: string; name: string }

export function MeetingsView({
  projectId,
  meetings,
  members,
  canCreate,
  canEdit,
  canDelete,
}: {
  projectId: string;
  meetings: MeetingRow[];
  members: Member[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [location, setLocation] = useState("");
  const [minutes, setMinutes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiRequest("/api/v1/meetings", {
        method: "POST",
        body: JSON.stringify({ projectId, title, meetingDate, location: location || null, minutes: minutes || null }),
      });
      setDialogOpen(false);
      setTitle(""); setMeetingDate(""); setLocation(""); setMinutes("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar reunião.");
    } finally {
      setBusy(false);
    }
  };

  const transition = async (id: string, action: string) => {
    setBusy(true);
    try {
      await apiRequest(`/api/v1/meetings/${id}/status`, { method: "POST", body: JSON.stringify({ action }) });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {canCreate && (
        <div>
          <Button onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Nova reunião</Button>
        </div>
      )}
      <Dialog open={dialogOpen} title="Nova reunião" onClose={() => setDialogOpen(false)}>
        <div className="flex flex-col gap-3 p-4">
          <h2 className="text-lg font-semibold">Nova reunião</h2>
          <div className="grid gap-2">
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Data</Label>
            <Input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Local</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Ata</Label>
            <textarea className="rounded-md border border-border bg-surface px-3 py-2 text-sm" rows={4} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </div>
          <Button onClick={create} disabled={busy}>Criar</Button>
        </div>
      </Dialog>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="px-4 py-2.5">Código</th>
              <th className="px-4 py-2.5">Título</th>
              <th className="px-4 py-2.5">Data</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Ações</th>
              <th className="px-4 py-2.5">Transição</th>
            </tr>
          </thead>
          <tbody>
            {meetings.map((m) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="px-4 py-2.5 font-mono text-xs">{m.code}</td>
                <td className="px-4 py-2.5">{m.title}</td>
                <td className="px-4 py-2.5">{m.meetingDate}</td>
                <td className="px-4 py-2.5">{m.status}</td>
                <td className="px-4 py-2.5">{m.actionCount}</td>
                <td className="px-4 py-2.5">
                  {canEdit && m.status === "DRAFT" && <Button size="sm" onClick={() => transition(m.id, "SUBMIT")}>Submeter</Button>}
                  {canEdit && m.status === "SUBMITTED" && <Button size="sm" onClick={() => transition(m.id, "APPROVE")}>Aprovar</Button>}
                  {canEdit && m.status === "CANCELLED" && <Button size="sm" onClick={() => transition(m.id, "REOPEN")}>Reabrir</Button>}
                  {canEdit && m.status !== "APPROVED" && m.status !== "CANCELLED" && <Button size="sm" variant="destructive" onClick={() => transition(m.id, "CANCEL")}>Cancelar</Button>}
                </td>
              </tr>
            ))}
            {meetings.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nenhuma reunião cadastrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}