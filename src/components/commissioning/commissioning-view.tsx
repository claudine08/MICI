"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";

interface WbsNodeLite { id: string; label: string }
interface ActivityLite { id: string; label: string }
interface MemberLite { id: string; label: string }

interface PlanRow {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: string;
  ownerId: string | null;
  ownerName: string | null;
  startDate: string | null;
  plannedEndDate: string | null;
  wbsNodeId: string | null;
  activityId: string | null;
  itemCount: number;
  passedCount: number;
  failedCount: number;
  availableActions: string[];
  createdAt: string;
  version: number;
}

interface ItemRow {
  id: string;
  code: string;
  planId: string;
  title: string;
  description: string | null;
  systemName: string | null;
  testMethod: string | null;
  acceptanceCriteria: string | null;
  status: string;
  result: string | null;
  notes: string | null;
  rejectReason: string | null;
  retestCount: number;
  evidencePhotoId: string | null;
  evidenceNotes: string | null;
  executedById: string | null;
  executedByName: string | null;
  executedAt: string | null;
  verifiedAt: string | null;
  acceptedAt: string | null;
  wbsNodeId: string | null;
  activityId: string | null;
  availableActions: string[];
  createdAt: string;
  version: number;
}

interface AcceptanceRow {
  id: string;
  code: string;
  commissioningPlanId: string | null;
  scope: string;
  status: string;
  acceptedById: string | null;
  acceptedByName: string | null;
  acceptedAt: string | null;
  notes: string | null;
  rejectReason: string | null;
  wbsNodeId: string | null;
  activityId: string | null;
  documentId: string | null;
  availableActions: string[];
  createdAt: string;
  version: number;
}

interface Props {
  projectId: string;
  initialPlans: PlanRow[];
  initialItems: ItemRow[];
  initialAcceptances: AcceptanceRow[];
  members: MemberLite[];
  wbsNodes: WbsNodeLite[];
  activities: ActivityLite[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export function CommissioningView({
  projectId,
  initialPlans,
  initialItems,
  initialAcceptances,
  members,
  wbsNodes,
  activities,
  canCreate,
  canEdit,
  canDelete,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<"plans" | "items" | "acceptances">("plans");
  const [plans] = useState(initialPlans);
  const [items] = useState(initialItems);
  const [acceptances] = useState(initialAcceptances);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [editPlanOpen, setEditPlanOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<{ id: string; title: string; description: string; ownerId: string; startDate: string; plannedEndDate: string; wbsNodeId: string; activityId: string } | null>(null);
  const [editItemOpen, setEditItemOpen] = useState(false);
  const [editItem, setEditItem] = useState<{ id: string; title: string; description: string; systemName: string; testMethod: string; acceptanceCriteria: string; wbsNodeId: string; activityId: string } | null>(null);
  const [editAcceptanceOpen, setEditAcceptanceOpen] = useState(false);
  const [editAcceptance, setEditAcceptance] = useState<{ id: string; scope: string; notes: string; commissioningPlanId: string; wbsNodeId: string; activityId: string } | null>(null);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [acceptanceDialogOpen, setAcceptanceDialogOpen] = useState(false);

  const [planForm, setPlanForm] = useState({ title: "", description: "", ownerId: "", startDate: "", plannedEndDate: "", wbsNodeId: "", activityId: "" });
  const [itemForm, setItemForm] = useState({ planId: "", title: "", description: "", systemName: "", testMethod: "", acceptanceCriteria: "", wbsNodeId: "", activityId: "" });
  const [acceptanceForm, setAcceptanceForm] = useState({ commissioningPlanId: "", scope: "", notes: "", wbsNodeId: "", activityId: "" });

  const refresh = () => {
    startTransition(() => router.refresh());
  };

  const exportCsv = (kind: "plans" | "items") => {
    const rows = kind === "plans" ? plans : items;
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(";"), ...rows.map((r) => headers.map((h) => JSON.stringify((r as any)[h] ?? "")).join(";"))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${kind}-commissioning.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const createPlan = async () => {
    await apiRequest(`/api/v1/projects/${projectId}/commissioning/plans`, {
      method: "POST",
      body: JSON.stringify({
        title: planForm.title,
        description: planForm.description || undefined,
        ownerId: planForm.ownerId || null,
        startDate: planForm.startDate || undefined,
        plannedEndDate: planForm.plannedEndDate || undefined,
        wbsNodeId: planForm.wbsNodeId || null,
        activityId: planForm.activityId || null,
      }),
    });
    setPlanDialogOpen(false);
    setPlanForm({ title: "", description: "", ownerId: "", startDate: "", plannedEndDate: "", wbsNodeId: "", activityId: "" });
    refresh();
  };

  const openEditPlan = (p: PlanRow) => {
    setEditPlan({ id: p.id, title: p.title, description: p.description ?? "", ownerId: p.ownerId ?? "", startDate: p.startDate ?? "", plannedEndDate: p.plannedEndDate ?? "", wbsNodeId: p.wbsNodeId ?? "", activityId: p.activityId ?? "" });
    setEditPlanOpen(true);
  };
  const updatePlan = async () => {
    if (!editPlan) return;
    await apiRequest(`/api/v1/projects/${projectId}/commissioning/plans/${editPlan.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: editPlan.title, description: editPlan.description || undefined, ownerId: editPlan.ownerId || null, startDate: editPlan.startDate || null, plannedEndDate: editPlan.plannedEndDate || null, wbsNodeId: editPlan.wbsNodeId || null, activityId: editPlan.activityId || null }),
    });
    setEditPlanOpen(false);
    setEditPlan(null);
    refresh();
  };

  const openEditItem = (it: ItemRow) => {
    setEditItem({ id: it.id, title: it.title, description: it.description ?? "", systemName: it.systemName ?? "", testMethod: it.testMethod ?? "", acceptanceCriteria: it.acceptanceCriteria ?? "", wbsNodeId: it.wbsNodeId ?? "", activityId: it.activityId ?? "" });
    setEditItemOpen(true);
  };
  const updateItem = async () => {
    if (!editItem) return;
    await apiRequest(`/api/v1/projects/${projectId}/commissioning/items/${editItem.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: editItem.title, description: editItem.description || undefined, systemName: editItem.systemName || undefined, testMethod: editItem.testMethod || undefined, acceptanceCriteria: editItem.acceptanceCriteria || undefined, wbsNodeId: editItem.wbsNodeId || null, activityId: editItem.activityId || null }),
    });
    setEditItemOpen(false);
    setEditItem(null);
    refresh();
  };

  const openEditAcceptance = (a: AcceptanceRow) => {
    setEditAcceptance({ id: a.id, scope: a.scope, notes: a.notes ?? "", commissioningPlanId: a.commissioningPlanId ?? "", wbsNodeId: a.wbsNodeId ?? "", activityId: a.activityId ?? "" });
    setEditAcceptanceOpen(true);
  };
  const updateAcceptance = async () => {
    if (!editAcceptance) return;
    await apiRequest(`/api/v1/projects/${projectId}/commissioning/acceptances/${editAcceptance.id}`, {
      method: "PATCH",
      body: JSON.stringify({ scope: editAcceptance.scope, notes: editAcceptance.notes || undefined, commissioningPlanId: editAcceptance.commissioningPlanId || null, wbsNodeId: editAcceptance.wbsNodeId || null, activityId: editAcceptance.activityId || null }),
    });
    setEditAcceptanceOpen(false);
    setEditAcceptance(null);
    refresh();
  };

  const createItem = async () => {
    await apiRequest(`/api/v1/projects/${projectId}/commissioning/items`, {
      method: "POST",
      body: JSON.stringify({
        planId: itemForm.planId,
        title: itemForm.title,
        description: itemForm.description || undefined,
        systemName: itemForm.systemName || undefined,
        testMethod: itemForm.testMethod || undefined,
        acceptanceCriteria: itemForm.acceptanceCriteria || undefined,
        wbsNodeId: itemForm.wbsNodeId || null,
        activityId: itemForm.activityId || null,
      }),
    });
    setItemDialogOpen(false);
    setItemForm({ planId: "", title: "", description: "", systemName: "", testMethod: "", acceptanceCriteria: "", wbsNodeId: "", activityId: "" });
    refresh();
  };

  const createAcceptance = async () => {
    await apiRequest(`/api/v1/projects/${projectId}/commissioning/acceptances`, {
      method: "POST",
      body: JSON.stringify({
        commissioningPlanId: acceptanceForm.commissioningPlanId || null,
        scope: acceptanceForm.scope,
        notes: acceptanceForm.notes || undefined,
        wbsNodeId: acceptanceForm.wbsNodeId || null,
        activityId: acceptanceForm.activityId || null,
      }),
    });
    setAcceptanceDialogOpen(false);
    setAcceptanceForm({ commissioningPlanId: "", scope: "", notes: "", wbsNodeId: "", activityId: "" });
    refresh();
  };

  const transitionPlan = async (planId: string, action: string) => {
    await apiRequest(`/api/v1/projects/${projectId}/commissioning/plans/${planId}/status`, {
      method: "POST",
      body: JSON.stringify({ action }),
    });
    refresh();
  };

  const transitionItem = async (itemId: string, action: string, extra?: Record<string, unknown>) => {
    await apiRequest(`/api/v1/projects/${projectId}/commissioning/items/${itemId}/status`, {
      method: "POST",
      body: JSON.stringify({ action, ...extra }),
    });
    refresh();
  };

  const transitionAcceptance = async (acceptanceId: string, action: string, reason?: string) => {
    await apiRequest(`/api/v1/projects/${projectId}/commissioning/acceptances/${acceptanceId}/status`, {
      method: "POST",
      body: JSON.stringify({ action, reason }),
    });
    refresh();
  };

  const deletePlan = async (planId: string) => {
    if (!confirm("Excluir este plano?")) return;
    await apiRequest(`/api/v1/projects/${projectId}/commissioning/plans/${planId}`, { method: "DELETE" });
    refresh();
  };

  const deleteItem = async (itemId: string) => {
    if (!confirm("Excluir este item?")) return;
    await apiRequest(`/api/v1/projects/${projectId}/commissioning/items/${itemId}`, { method: "DELETE" });
    refresh();
  };

  const deleteAcceptance = async (acceptanceId: string) => {
    if (!confirm("Excluir este aceite?")) return;
    await apiRequest(`/api/v1/projects/${projectId}/commissioning/acceptances/${acceptanceId}`, { method: "DELETE" });
    refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Button variant={tab === "plans" ? "default" : "outline"} size="sm" onClick={() => setTab("plans")}>Planos ({plans.length})</Button>
        <Button variant={tab === "items" ? "default" : "outline"} size="sm" onClick={() => setTab("items")}>Itens ({items.length})</Button>
        <Button variant={tab === "acceptances" ? "default" : "outline"} size="sm" onClick={() => setTab("acceptances")}>Aceites ({acceptances.length})</Button>
      </div>

      {tab === "plans" && (
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Planos de comissionamento</h2>
            <div className="flex flex-wrap items-center gap-2">
              <select className="rounded border p-1 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="ALL">Todos os status</option>
                <option value="DRAFT">Rascunho</option>
                <option value="ACTIVE">Ativo</option>
                <option value="COMPLETED">Concluído</option>
                <option value="CANCELLED">Cancelado</option>
              </select>
              <Button size="sm" variant="outline" onClick={() => exportCsv("plans")}>Exportar CSV</Button>
              {canCreate && (
                <Button size="sm" onClick={() => setPlanDialogOpen(true)}><Plus className="mr-1 h-4 w-4" /> Novo plano</Button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3">Código</th>
                  <th className="py-2 pr-3">Título</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Itens</th>
                  <th className="py-2 pr-3">Aprovados</th>
                  <th className="py-2 pr-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {plans.filter((p) => statusFilter === "ALL" || p.status === statusFilter).map((plan) => (
                  <tr key={plan.id} className="border-b">
                    <td className="py-2 pr-3 font-mono">{plan.code}</td>
                    <td className="py-2 pr-3">{plan.title}</td>
                    <td className="py-2 pr-3"><Badge variant="outline">{plan.status}</Badge></td>
                    <td className="py-2 pr-3">{plan.itemCount}</td>
                    <td className="py-2 pr-3">{plan.passedCount}/{plan.itemCount}</td>
                    <td className="py-2 pr-3 flex gap-1 flex-wrap">
                      {canEdit && (
                        <Button size="sm" variant="outline" onClick={() => openEditPlan(plan)}>Editar</Button>
                      )}
                      {canEdit && plan.availableActions.map((a) => (
                        <Button key={a} size="sm" variant="outline" onClick={() => transitionPlan(plan.id, a)}>{a}</Button>
                      ))}
                      {canDelete && (plan.status === "DRAFT" || plan.status === "CANCELLED") && (
                        <Button size="sm" variant="ghost" onClick={() => deletePlan(plan.id)}><Trash2 className="h-4 w-4" /></Button>
                      )}
                    </td>
                  </tr>
                ))}
                {plans.length === 0 && (
                  <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">Nenhum plano cadastrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "items" && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Itens de teste</h2>
            {canCreate && (
              <Button size="sm" onClick={() => setItemDialogOpen(true)}><Plus className="mr-1 h-4 w-4" /> Novo item</Button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3">Código</th>
                  <th className="py-2 pr-3">Título</th>
                  <th className="py-2 pr-3">Sistema</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Resultado</th>
                  <th className="py-2 pr-3">Retestes</th>
                  <th className="py-2 pr-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b">
                    <td className="py-2 pr-3 font-mono">{item.code}</td>
                    <td className="py-2 pr-3">{item.title}</td>
                    <td className="py-2 pr-3">{item.systemName ?? "—"}</td>
                    <td className="py-2 pr-3"><Badge variant="outline">{item.status}</Badge></td>
                    <td className="py-2 pr-3">{item.result ?? "—"}</td>
                    <td className="py-2 pr-3">{item.retestCount}</td>
                    <td className="py-2 pr-3 flex gap-1 flex-wrap">
                      {canEdit && (
                        <Button size="sm" variant="outline" onClick={() => openEditItem(item)}>Editar</Button>
                      )}
                      {canEdit && item.availableActions.map((a) => (
                        <Button key={a} size="sm" variant="outline" onClick={() => {
                          if (a === "PASS") transitionItem(item.id, a, { result: "PASS" });
                          else if (a === "FAIL") {
                            const reason = prompt("Motivo da reprovação:");
                            if (reason === null) return;
                            transitionItem(item.id, a, { reason });
                          } else transitionItem(item.id, a);
                        }}>{a}</Button>
                      ))}
                      {canDelete && (item.status === "PLANNED" || item.status === "FAILED") && (
                        <Button size="sm" variant="ghost" onClick={() => deleteItem(item.id)}><Trash2 className="h-4 w-4" /></Button>
                      )}
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={7} className="py-4 text-center text-muted-foreground">Nenhum item cadastrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "acceptances" && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Aceites formais</h2>
            {canCreate && (
              <Button size="sm" onClick={() => setAcceptanceDialogOpen(true)}><Plus className="mr-1 h-4 w-4" /> Novo aceite</Button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3">Código</th>
                  <th className="py-2 pr-3">Escopo</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Aceito por</th>
                  <th className="py-2 pr-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {acceptances.map((acc) => (
                  <tr key={acc.id} className="border-b">
                    <td className="py-2 pr-3 font-mono">{acc.code}</td>
                    <td className="py-2 pr-3">{acc.scope}</td>
                    <td className="py-2 pr-3"><Badge variant="outline">{acc.status}</Badge></td>
                    <td className="py-2 pr-3">{acc.acceptedByName ?? "—"}</td>
                    <td className="py-2 pr-3 flex gap-1 flex-wrap">
                      {canEdit && (
                        <Button size="sm" variant="outline" onClick={() => openEditAcceptance(acc)}>Editar</Button>
                      )}
                      {canEdit && acc.availableActions.map((a) => (
                        <Button key={a} size="sm" variant="outline" onClick={() => {
                          if (a === "REJECT") {
                            const reason = prompt("Motivo da rejeição:");
                            if (reason === null) return;
                            transitionAcceptance(acc.id, a, reason);
                          } else transitionAcceptance(acc.id, a);
                        }}>{a}</Button>
                      ))}
                      {canDelete && (acc.status === "DRAFT" || acc.status === "REJECTED") && (
                        <Button size="sm" variant="ghost" onClick={() => deleteAcceptance(acc.id)}><Trash2 className="h-4 w-4" /></Button>
                      )}
                    </td>
                  </tr>
                ))}
                {acceptances.length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">Nenhum aceite cadastrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog open={planDialogOpen} title="Novo plano de comissionamento" onClose={() => setPlanDialogOpen(false)}>
        <div className="space-y-3 p-4">
          <h3 className="text-lg font-semibold">Novo plano de comissionamento</h3>
          <div>
            <Label>Título</Label>
            <Input value={planForm.title} onChange={(e) => setPlanForm({ ...planForm, title: e.target.value })} />
          </div>
          <div>
            <Label>Descrição</Label>
            <Input value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} />
          </div>
          <div>
            <Label>Responsável</Label>
            <select className="w-full rounded border p-2" value={planForm.ownerId} onChange={(e) => setPlanForm({ ...planForm, ownerId: e.target.value })}>
              <option value="">—</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Início</Label><Input type="date" value={planForm.startDate} onChange={(e) => setPlanForm({ ...planForm, startDate: e.target.value })} /></div>
            <div><Label>Fim previsto</Label><Input type="date" value={planForm.plannedEndDate} onChange={(e) => setPlanForm({ ...planForm, plannedEndDate: e.target.value })} /></div>
          </div>
          <div>
            <Label>WBS</Label>
            <select className="w-full rounded border p-2" value={planForm.wbsNodeId} onChange={(e) => setPlanForm({ ...planForm, wbsNodeId: e.target.value })}>
              <option value="">—</option>
              {wbsNodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Atividade</Label>
            <select className="w-full rounded border p-2" value={planForm.activityId} onChange={(e) => setPlanForm({ ...planForm, activityId: e.target.value })}>
              <option value="">—</option>
              {activities.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPlanDialogOpen(false)}>Cancelar</Button>
            <Button onClick={createPlan} disabled={isPending || !planForm.title}>Criar</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={itemDialogOpen} title="Novo item de teste" onClose={() => setItemDialogOpen(false)}>
        <div className="space-y-3 p-4">
          <h3 className="text-lg font-semibold">Novo item de teste</h3>
          <div>
            <Label>Plano</Label>
            <select className="w-full rounded border p-2" value={itemForm.planId} onChange={(e) => setItemForm({ ...itemForm, planId: e.target.value })}>
              <option value="">—</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.title}</option>)}
            </select>
          </div>
          <div>
            <Label>Título</Label>
            <Input value={itemForm.title} onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })} />
          </div>
          <div>
            <Label>Descrição</Label>
            <Input value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} />
          </div>
          <div>
            <Label>Sistema/Equipamento</Label>
            <Input value={itemForm.systemName} onChange={(e) => setItemForm({ ...itemForm, systemName: e.target.value })} />
          </div>
          <div>
            <Label>Método de teste</Label>
            <Input value={itemForm.testMethod} onChange={(e) => setItemForm({ ...itemForm, testMethod: e.target.value })} />
          </div>
          <div>
            <Label>Critério de aceite</Label>
            <Input value={itemForm.acceptanceCriteria} onChange={(e) => setItemForm({ ...itemForm, acceptanceCriteria: e.target.value })} />
          </div>
          <div>
            <Label>WBS</Label>
            <select className="w-full rounded border p-2" value={itemForm.wbsNodeId} onChange={(e) => setItemForm({ ...itemForm, wbsNodeId: e.target.value })}>
              <option value="">—</option>
              {wbsNodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Atividade</Label>
            <select className="w-full rounded border p-2" value={itemForm.activityId} onChange={(e) => setItemForm({ ...itemForm, activityId: e.target.value })}>
              <option value="">—</option>
              {activities.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setItemDialogOpen(false)}>Cancelar</Button>
            <Button onClick={createItem} disabled={isPending || !itemForm.title || !itemForm.planId}>Criar</Button>
          </div>
        </div>
      </Dialog>

      {editPlan && (
        <Dialog open={editPlanOpen} title="Editar plano de comissionamento" onClose={() => { setEditPlanOpen(false); setEditPlan(null); }}>
          <div className="space-y-3 p-4">
            <div><Label>Título</Label><Input value={editPlan.title} onChange={(e) => setEditPlan({ ...editPlan, title: e.target.value })} /></div>
            <div><Label>Descrição</Label><Input value={editPlan.description} onChange={(e) => setEditPlan({ ...editPlan, description: e.target.value })} /></div>
            <div><Label>Responsável</Label>
              <select className="w-full rounded border p-2" value={editPlan.ownerId} onChange={(e) => setEditPlan({ ...editPlan, ownerId: e.target.value })}>
                <option value="">—</option>{members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Início</Label><Input type="date" value={editPlan.startDate} onChange={(e) => setEditPlan({ ...editPlan, startDate: e.target.value })} /></div>
              <div><Label>Fim previsto</Label><Input type="date" value={editPlan.plannedEndDate} onChange={(e) => setEditPlan({ ...editPlan, plannedEndDate: e.target.value })} /></div>
            </div>
            <div><Label>WBS</Label>
              <select className="w-full rounded border p-2" value={editPlan.wbsNodeId} onChange={(e) => setEditPlan({ ...editPlan, wbsNodeId: e.target.value })}>
                <option value="">—</option>{wbsNodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
            </div>
            <div><Label>Atividade</Label>
              <select className="w-full rounded border p-2" value={editPlan.activityId} onChange={(e) => setEditPlan({ ...editPlan, activityId: e.target.value })}>
                <option value="">—</option>{activities.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setEditPlanOpen(false); setEditPlan(null); }}>Cancelar</Button>
              <Button onClick={updatePlan} disabled={isPending || !editPlan.title}>Salvar</Button>
            </div>
          </div>
        </Dialog>
      )}
      {editItem && (
        <Dialog open={editItemOpen} title="Editar item de teste" onClose={() => { setEditItemOpen(false); setEditItem(null); }}>
          <div className="space-y-3 p-4">
            <div><Label>Título</Label><Input value={editItem.title} onChange={(e) => setEditItem({ ...editItem, title: e.target.value })} /></div>
            <div><Label>Descrição</Label><Input value={editItem.description} onChange={(e) => setEditItem({ ...editItem, description: e.target.value })} /></div>
            <div><Label>Sistema/Equipamento</Label><Input value={editItem.systemName} onChange={(e) => setEditItem({ ...editItem, systemName: e.target.value })} /></div>
            <div><Label>Método de teste</Label><Input value={editItem.testMethod} onChange={(e) => setEditItem({ ...editItem, testMethod: e.target.value })} /></div>
            <div><Label>Critério de aceite</Label><Input value={editItem.acceptanceCriteria} onChange={(e) => setEditItem({ ...editItem, acceptanceCriteria: e.target.value })} /></div>
            <div><Label>WBS</Label>
              <select className="w-full rounded border p-2" value={editItem.wbsNodeId} onChange={(e) => setEditItem({ ...editItem, wbsNodeId: e.target.value })}>
                <option value="">—</option>{wbsNodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
            </div>
            <div><Label>Atividade</Label>
              <select className="w-full rounded border p-2" value={editItem.activityId} onChange={(e) => setEditItem({ ...editItem, activityId: e.target.value })}>
                <option value="">—</option>{activities.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setEditItemOpen(false); setEditItem(null); }}>Cancelar</Button>
              <Button onClick={updateItem} disabled={isPending || !editItem.title}>Salvar</Button>
            </div>
          </div>
        </Dialog>
      )}
      {editAcceptance && (
        <Dialog open={editAcceptanceOpen} title="Editar aceite" onClose={() => { setEditAcceptanceOpen(false); setEditAcceptance(null); }}>
          <div className="space-y-3 p-4">
            <div><Label>Escopo</Label><Input value={editAcceptance.scope} onChange={(e) => setEditAcceptance({ ...editAcceptance, scope: e.target.value })} /></div>
            <div><Label>Notas</Label><Input value={editAcceptance.notes} onChange={(e) => setEditAcceptance({ ...editAcceptance, notes: e.target.value })} /></div>
            <div><Label>Plano (opcional)</Label>
              <select className="w-full rounded border p-2" value={editAcceptance.commissioningPlanId} onChange={(e) => setEditAcceptance({ ...editAcceptance, commissioningPlanId: e.target.value })}>
                <option value="">—</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.title}</option>)}
              </select>
            </div>
            <div><Label>WBS</Label>
              <select className="w-full rounded border p-2" value={editAcceptance.wbsNodeId} onChange={(e) => setEditAcceptance({ ...editAcceptance, wbsNodeId: e.target.value })}>
                <option value="">—</option>{wbsNodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
            </div>
            <div><Label>Atividade</Label>
              <select className="w-full rounded border p-2" value={editAcceptance.activityId} onChange={(e) => setEditAcceptance({ ...editAcceptance, activityId: e.target.value })}>
                <option value="">—</option>{activities.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setEditAcceptanceOpen(false); setEditAcceptance(null); }}>Cancelar</Button>
              <Button onClick={updateAcceptance} disabled={isPending || !editAcceptance.scope}>Salvar</Button>
            </div>
          </div>
        </Dialog>
      )}
      <Dialog open={acceptanceDialogOpen} title="Novo aceite formal" onClose={() => setAcceptanceDialogOpen(false)}>
        <div className="space-y-3 p-4">
          <h3 className="text-lg font-semibold">Novo aceite formal</h3>
          <div>
            <Label>Plano (opcional)</Label>
            <select className="w-full rounded border p-2" value={acceptanceForm.commissioningPlanId} onChange={(e) => setAcceptanceForm({ ...acceptanceForm, commissioningPlanId: e.target.value })}>
              <option value="">—</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.title}</option>)}
            </select>
          </div>
          <div>
            <Label>Escopo</Label>
            <Input value={acceptanceForm.scope} onChange={(e) => setAcceptanceForm({ ...acceptanceForm, scope: e.target.value })} />
          </div>
          <div>
            <Label>Notas</Label>
            <Input value={acceptanceForm.notes} onChange={(e) => setAcceptanceForm({ ...acceptanceForm, notes: e.target.value })} />
          </div>
          <div>
            <Label>WBS</Label>
            <select className="w-full rounded border p-2" value={acceptanceForm.wbsNodeId} onChange={(e) => setAcceptanceForm({ ...acceptanceForm, wbsNodeId: e.target.value })}>
              <option value="">—</option>
              {wbsNodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Atividade</Label>
            <select className="w-full rounded border p-2" value={acceptanceForm.activityId} onChange={(e) => setAcceptanceForm({ ...acceptanceForm, activityId: e.target.value })}>
              <option value="">—</option>
              {activities.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAcceptanceDialogOpen(false)}>Cancelar</Button>
            <Button onClick={createAcceptance} disabled={isPending || !acceptanceForm.scope}>Criar</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}