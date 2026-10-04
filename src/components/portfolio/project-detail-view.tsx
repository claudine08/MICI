"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Pencil, ExternalLink } from "lucide-react";
import type { ProjectDetail } from "@/modules/portfolio/selectors";
import type { GateInstanceRow } from "@/modules/gates/instances";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PROJECT_STATUS_LABELS, GATE_STATUS_LABELS, PROJECT_PHASES, phaseName } from "./labels";
import { GateDialog } from "./gate-dialog";

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

export function ProjectDetailView({
  project,
  gates,
  clients,
  templates,
  members,
  canEdit,
  canManageGates,
  canApproveGates,
  canRejectGates,
}: {
  project: ProjectDetail;
  gates: GateInstanceRow[];
  clients: Option[];
  templates: Option[];
  members: Option[];
  canEdit: boolean;
  canManageGates: boolean;
  canApproveGates: boolean;
  canRejectGates: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [openGate, setOpenGate] = useState<GateInstanceRow | null>(null);
  const [form, setForm] = useState({
    name: project.name,
    description: project.description ?? "",
    clientId: project.clientId ?? "",
    projectTemplateId: project.projectTemplateId ?? "",
    projectType: project.projectType ?? "",
    location: project.location ?? "",
    status: project.status,
    startDate: project.startDate ? String(project.startDate).slice(0, 10) : "",
    plannedEndDate: project.plannedEndDate
      ? String(project.plannedEndDate).slice(0, 10)
      : "",
    projectManagerId: project.projectManagerId ?? "",
  });

  const phaseIndex = PROJECT_PHASES.findIndex((phase) => phase.code === project.currentPhase);
  const statusInfo = PROJECT_STATUS_LABELS[project.status] ?? {
    label: project.status,
    variant: "secondary" as const,
  };
  const isTerminal = ["COMPLETED", "CANCELLED", "ARCHIVED"].includes(project.status);

  const set = (key: keyof typeof form, value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const changePhase = async (direction: "advance" | "retreat") => {
    setError(null);
    setBusy(true);
    try {
      await apiRequest(`/api/v1/projects/${project.id}/phase`, {
        method: "POST",
        body: JSON.stringify({ direction }),
      });
      router.refresh();
    } catch (caught) {
      // 409 PHASE_ADVANCE_BLOCKED já vem com a lista de gates pendentes (BR-001).
      setError(caught instanceof Error ? caught.message : "Falha ao alterar a fase.");
    } finally {
      setBusy(false);
    }
  };

  const submitEdit = async () => {
    setError(null);
    setBusy(true);
    try {
      await apiRequest(`/api/v1/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          clientId: form.clientId || null,
          projectTemplateId: form.projectTemplateId || null,
          projectType: form.projectType,
          location: form.location,
          status: form.status,
          startDate: form.startDate || null,
          plannedEndDate: form.plannedEndDate || null,
          projectManagerId: form.projectManagerId || null,
        }),
      });
      setEditOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <ErrorBox message={error} />

      {/* Cabeçalho + stepper de fase */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">{project.code}</span>
              {project.name}
              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            </CardTitle>
            <CardDescription>
              {project.clientName ? `Cliente: ${project.clientName}` : "Sem cliente"} ·{" "}
              {project.templateName ? `Template: ${project.templateName}` : "Sem template"}
            </CardDescription>
          </div>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {PROJECT_PHASES.map((phase, index) => (
              <span
                key={phase.code}
                title={phase.name}
                className={`rounded border px-2 py-0.5 text-xs ${
                  index === phaseIndex
                    ? "border-primary bg-primary/10 font-semibold text-primary"
                    : index < phaseIndex
                      ? "border-border bg-muted text-muted-foreground"
                      : "border-border text-muted-foreground"
                }`}
              >
                {phase.code}
              </span>
            ))}
            <span className="ml-2 text-sm font-medium">
              {project.currentPhase} · {phaseName(project.currentPhase)}
            </span>
          </div>
          {canEdit && !isTerminal && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy || phaseIndex <= 0}
                onClick={() => void changePhase("retreat")}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Fase anterior
              </Button>
              <Button
                size="sm"
                disabled={busy || phaseIndex >= PROJECT_PHASES.length - 1}
                onClick={() => void changePhase("advance")}
              >
                Avançar fase
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <span className="self-center text-xs text-muted-foreground">
                BR-001: gates obrigatórios desta fase precisam estar aprovados/dispensados.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gates */}
      <Card>
        <CardHeader>
          <CardTitle>Gates de governança</CardTitle>
          <CardDescription>
            {project.gates.approved}/{project.gates.total} liberados · aprovação exige critérios
            completos e evidência (BR-002)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2">Gate</th>
                  <th className="px-3 py-2">Fase</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Critérios</th>
                  <th className="px-3 py-2">Evidências</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {gates.map((gate) => {
                  const info = GATE_STATUS_LABELS[gate.status] ?? {
                    label: gate.status,
                    variant: "secondary" as const,
                  };
                  const done = gate.criteria.filter(
                    (criterion) => gate.results[criterion.code]?.completed
                  ).length;
                  return (
                    <tr key={gate.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <span className="font-medium">
                          <span className="font-mono text-xs text-muted-foreground">
                            {gate.code}
                          </span>{" "}
                          {gate.name}
                        </span>
                        {gate.required && (
                          <Badge variant="warning" className="ml-2">
                            Obrigatório
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{gate.phase}</td>
                      <td className="px-3 py-2">
                        <Badge variant={info.variant}>{info.label}</Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {done}/{gate.criteria.length}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {gate.evidences.length}
                        {gate.requiresEvidence && gate.evidences.length === 0 && (
                          <span className="ml-1 text-xs text-destructive">exigida</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setOpenGate(gate)}
                          title="Abrir gate"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Abrir
                          {!canManageGates && !canApproveGates && !canRejectGates && " (leitura)"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {gates.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                      Carregando gates…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Dados do projeto */}
      <Card>
        <CardHeader>
          <CardTitle>Dados do projeto</CardTitle>
          <CardDescription>
            Fase {project.currentPhase} · contrato {project.currency}
            {project.contractValue ? ` ${Number(project.contractValue).toLocaleString("pt-BR")}` : ""}{" "}
            · fuso {project.timezone}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">Descrição: </span>
            {project.description ?? "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Tipo: </span>
            {project.projectType ?? "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Localização: </span>
            {project.location ?? "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Início / fim planejado: </span>
            {project.startDate ? String(project.startDate).slice(0, 10) : "—"} →{" "}
            {project.plannedEndDate ? String(project.plannedEndDate).slice(0, 10) : "—"}
          </div>
        </CardContent>
      </Card>

      {/* Diálogo de edição */}
      <Dialog open={editOpen} title={`Editar ${project.code}`} onClose={() => setEditOpen(false)} wide>
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Nome *</Label>
              <Input id="edit-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-status">Status</Label>
              <select
                id="edit-status"
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
              >
                {Object.entries(PROJECT_STATUS_LABELS).map(([value, info]) => (
                  <option key={value} value={value}>
                    {info.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-client">Cliente</Label>
              <select
                id="edit-client"
                value={form.clientId}
                onChange={(e) => set("clientId", e.target.value)}
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
              <Label htmlFor="edit-template">Template</Label>
              <select
                id="edit-template"
                value={form.projectTemplateId}
                onChange={(e) => set("projectTemplateId", e.target.value)}
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
              <Label htmlFor="edit-manager">Gerente do projeto</Label>
              <select
                id="edit-manager"
                value={form.projectManagerId}
                onChange={(e) => set("projectManagerId", e.target.value)}
                className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
              >
                <option value="">— Não definido —</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-type">Tipo</Label>
              <Input
                id="edit-type"
                value={form.projectType}
                onChange={(e) => set("projectType", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-location">Localização</Label>
              <Input
                id="edit-location"
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-start">Início</Label>
              <Input
                id="edit-start"
                type="date"
                value={form.startDate}
                onChange={(e) => set("startDate", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-end">Fim planejado</Label>
              <Input
                id="edit-end"
                type="date"
                value={form.plannedEndDate}
                onChange={(e) => set("plannedEndDate", e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-description">Descrição</Label>
            <textarea
              id="edit-description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void submitEdit()} disabled={busy || !form.name}>
              {busy ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Diálogo do gate */}
      {openGate && (
        <GateDialog
          gate={openGate}
          canEdit={canManageGates}
          canApprove={canApproveGates}
          canReject={canRejectGates}
          onClose={() => {
            setOpenGate(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
