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

interface PlanRow { id: string; code: string; title: string; description: string | null; status: string; ownerId: string | null; ownerName: string | null; startDate: string | null; plannedEndDate: string | null; wbsNodeId: string | null; activityId: string | null; metricCount: number; availableActions: string[]; createdAt: string; version: number; }
interface MetricRow { id: string; code: string; planId: string | null; name: string; unit: string; category: string | null; description: string | null; baselineCount: number; targetCount: number; measurementCount: number; createdAt: string; version: number; }
interface BaselineRow { id: string; code: string; metricId: string; value: number; recordedAt: string; source: string | null; notes: string | null; createdAt: string; version: number; }
interface TargetRow { id: string; code: string; metricId: string; targetValue: number; dueDate: string | null; notes: string | null; createdAt: string; version: number; }
interface MeasurementRow { id: string; code: string; metricId: string; value: number; measuredAt: string; wbsNodeId: string | null; activityId: string | null; notes: string | null; evidenceNotes: string | null; createdAt: string; version: number; }
interface WasteRow { id: string; code: string; wasteType: string; quantity: number; unit: string; destination: string | null; recordedAt: string; wbsNodeId: string | null; activityId: string | null; notes: string | null; createdAt: string; version: number; }

interface Props {
  projectId: string;
  initialPlans: PlanRow[];
  initialMetrics: MetricRow[];
  initialBaselines: BaselineRow[];
  initialTargets: TargetRow[];
  initialMeasurements: MeasurementRow[];
  initialWastes: WasteRow[];
  members: MemberLite[];
  wbsNodes: WbsNodeLite[];
  activities: ActivityLite[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export function SustainabilityView(props: Props) {
  const { projectId, initialPlans, initialMetrics, initialBaselines, initialTargets, initialMeasurements, initialWastes, members, wbsNodes, activities, canCreate, canEdit, canDelete } = props;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<"plans" | "metrics" | "baselines" | "targets" | "measurements" | "wastes">("plans");
  const [plans] = useState(initialPlans);
  const [metrics] = useState(initialMetrics);
  const [baselines] = useState(initialBaselines);
  const [targets] = useState(initialTargets);
  const [measurements] = useState(initialMeasurements);
  const [wastes] = useState(initialWastes);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const [planOpen, setPlanOpen] = useState(false);
  const [editPlanOpen, setEditPlanOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<{ id: string; title: string; description: string; ownerId: string; startDate: string; plannedEndDate: string; wbsNodeId: string; activityId: string } | null>(null);
  const [metricOpen, setMetricOpen] = useState(false);
  const [baselineOpen, setBaselineOpen] = useState(false);
  const [targetOpen, setTargetOpen] = useState(false);
  const [measurementOpen, setMeasurementOpen] = useState(false);
  const [wasteOpen, setWasteOpen] = useState(false);
  const [planForm, setPlanForm] = useState({ title: "", description: "", ownerId: "", startDate: "", plannedEndDate: "", wbsNodeId: "", activityId: "" });
  const [metricForm, setMetricForm] = useState({ planId: "", name: "", unit: "", category: "", description: "" });
  const [wasteForm, setWasteForm] = useState({ wasteType: "", quantity: "", unit: "", destination: "", recordedAt: "", wbsNodeId: "", activityId: "", notes: "" });
  const [baselineForm, setBaselineForm] = useState({ metricId: "", value: "", recordedAt: "", source: "", notes: "" });
  const [targetForm, setTargetForm] = useState({ metricId: "", targetValue: "", dueDate: "", notes: "" });
  const [measurementForm, setMeasurementForm] = useState({ metricId: "", value: "", measuredAt: "", wbsNodeId: "", activityId: "", notes: "", evidenceNotes: "" });

  const refresh = () => startTransition(() => router.refresh());
  const exportCsv = <T extends object>(rows: T[], name: string) => {
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(";"), ...rows.map((r) => headers.map((h) => JSON.stringify((r as Record<string, unknown>)[h] ?? "")).join(";"))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const createPlan = async () => {
    await apiRequest(`/api/v1/projects/${projectId}/sustainability/plans`, { method: "POST", body: JSON.stringify({ title: planForm.title, description: planForm.description || undefined, ownerId: planForm.ownerId || null, startDate: planForm.startDate || undefined, plannedEndDate: planForm.plannedEndDate || undefined, wbsNodeId: planForm.wbsNodeId || null, activityId: planForm.activityId || null }) });
    setPlanOpen(false); setPlanForm({ title: "", description: "", ownerId: "", startDate: "", plannedEndDate: "", wbsNodeId: "", activityId: "" }); refresh();
  };
  const openEditPlan = (p: PlanRow) => {
    setEditPlan({ id: p.id, title: p.title, description: p.description ?? "", ownerId: p.ownerId ?? "", startDate: p.startDate ?? "", plannedEndDate: p.plannedEndDate ?? "", wbsNodeId: p.wbsNodeId ?? "", activityId: p.activityId ?? "" });
    setEditPlanOpen(true);
  };
  const updatePlan = async () => {
    if (!editPlan) return;
    await apiRequest(`/api/v1/projects/${projectId}/sustainability/plans/${editPlan.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: editPlan.title, description: editPlan.description || undefined, ownerId: editPlan.ownerId || null, startDate: editPlan.startDate || null, plannedEndDate: editPlan.plannedEndDate || null, wbsNodeId: editPlan.wbsNodeId || null, activityId: editPlan.activityId || null }),
    });
    setEditPlanOpen(false);
    setEditPlan(null);
    refresh();
  };
  const createMetric = async () => {
    await apiRequest(`/api/v1/projects/${projectId}/sustainability/metrics`, { method: "POST", body: JSON.stringify({ planId: metricForm.planId || null, name: metricForm.name, unit: metricForm.unit, category: metricForm.category || undefined, description: metricForm.description || undefined }) });
    setMetricOpen(false); setMetricForm({ planId: "", name: "", unit: "", category: "", description: "" }); refresh();
  };
  const createWaste = async () => {
    await apiRequest(`/api/v1/projects/${projectId}/sustainability/wastes`, { method: "POST", body: JSON.stringify({ wasteType: wasteForm.wasteType, quantity: Number(wasteForm.quantity), unit: wasteForm.unit, destination: wasteForm.destination || undefined, recordedAt: wasteForm.recordedAt, wbsNodeId: wasteForm.wbsNodeId || null, activityId: wasteForm.activityId || null, notes: wasteForm.notes || undefined }) });
    setWasteOpen(false); setWasteForm({ wasteType: "", quantity: "", unit: "", destination: "", recordedAt: "", wbsNodeId: "", activityId: "", notes: "" }); refresh();
  };
  const createBaseline = async () => {
    await apiRequest(`/api/v1/projects/${projectId}/sustainability/baselines`, { method: "POST", body: JSON.stringify({ metricId: baselineForm.metricId, value: Number(baselineForm.value), recordedAt: baselineForm.recordedAt, source: baselineForm.source || undefined, notes: baselineForm.notes || undefined }) });
    setBaselineOpen(false); setBaselineForm({ metricId: "", value: "", recordedAt: "", source: "", notes: "" }); refresh();
  };
  const createTarget = async () => {
    await apiRequest(`/api/v1/projects/${projectId}/sustainability/targets`, { method: "POST", body: JSON.stringify({ metricId: targetForm.metricId, targetValue: Number(targetForm.targetValue), dueDate: targetForm.dueDate || undefined, notes: targetForm.notes || undefined }) });
    setTargetOpen(false); setTargetForm({ metricId: "", targetValue: "", dueDate: "", notes: "" }); refresh();
  };
  const createMeasurement = async () => {
    await apiRequest(`/api/v1/projects/${projectId}/sustainability/measurements`, { method: "POST", body: JSON.stringify({ metricId: measurementForm.metricId, value: Number(measurementForm.value), measuredAt: measurementForm.measuredAt, wbsNodeId: measurementForm.wbsNodeId || null, activityId: measurementForm.activityId || null, notes: measurementForm.notes || undefined, evidenceNotes: measurementForm.evidenceNotes || undefined }) });
    setMeasurementOpen(false); setMeasurementForm({ metricId: "", value: "", measuredAt: "", wbsNodeId: "", activityId: "", notes: "", evidenceNotes: "" }); refresh();
  };

  const transitionPlan = async (planId: string, action: string) => {
    await apiRequest(`/api/v1/projects/${projectId}/sustainability/plans/${planId}/status`, { method: "POST", body: JSON.stringify({ action }) }); refresh();
  };
  const deletePlan = async (planId: string) => { if (!confirm("Excluir?")) return; await apiRequest(`/api/v1/projects/${projectId}/sustainability/plans/${planId}`, { method: "DELETE" }); refresh(); };
  const deleteMetric = async (metricId: string) => { if (!confirm("Excluir?")) return; await apiRequest(`/api/v1/projects/${projectId}/sustainability/metrics/${metricId}`, { method: "DELETE" }); refresh(); };
  const deleteBaseline = async (id: string) => { if (!confirm("Excluir?")) return; await apiRequest(`/api/v1/projects/${projectId}/sustainability/baselines/${id}`, { method: "DELETE" }); refresh(); };
  const deleteTarget = async (id: string) => { if (!confirm("Excluir?")) return; await apiRequest(`/api/v1/projects/${projectId}/sustainability/targets/${id}`, { method: "DELETE" }); refresh(); };
  const deleteMeasurement = async (id: string) => { if (!confirm("Excluir?")) return; await apiRequest(`/api/v1/projects/${projectId}/sustainability/measurements/${id}`, { method: "DELETE" }); refresh(); };
  const deleteWaste = async (id: string) => { if (!confirm("Excluir?")) return; await apiRequest(`/api/v1/projects/${projectId}/sustainability/wastes/${id}`, { method: "DELETE" }); refresh(); };

  const tabBtn = (t: typeof tab, label: string, count: number) => (
    <Button variant={tab === t ? "default" : "outline"} size="sm" onClick={() => setTab(t)}>{label} ({count})</Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {tabBtn("plans", "Planos", plans.length)}
        {tabBtn("metrics", "Métricas", metrics.length)}
        {tabBtn("baselines", "Baselines", baselines.length)}
        {tabBtn("targets", "Metas", targets.length)}
        {tabBtn("measurements", "Medições", measurements.length)}
        {tabBtn("wastes", "Resíduos", wastes.length)}
      </div>

      {tab === "plans" && (
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Planos de sustentabilidade (PSP)</h2>
            <div className="flex flex-wrap items-center gap-2">
              <select className="rounded border p-1 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="ALL">Todos os status</option>
                <option value="DRAFT">Rascunho</option>
                <option value="ACTIVE">Ativo</option>
                <option value="COMPLETED">Concluído</option>
                <option value="CANCELLED">Cancelado</option>
              </select>
              <Button size="sm" variant="outline" onClick={() => exportCsv(plans.filter((p) => statusFilter === "ALL" || p.status === statusFilter), "plans-sustainability")}>Exportar CSV</Button>
              {canCreate && <Button size="sm" onClick={() => setPlanOpen(true)}><Plus className="mr-1 h-4 w-4" /> Novo plano</Button>}
            </div>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 pr-3">Código</th><th className="py-2 pr-3">Título</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Métricas</th><th className="py-2 pr-3">Ações</th></tr></thead>
            <tbody>
              {plans.filter((p) => statusFilter === "ALL" || p.status === statusFilter).map(p => (
                <tr key={p.id} className="border-b">
                  <td className="py-2 pr-3 font-mono">{p.code}</td>
                  <td className="py-2 pr-3">{p.title}</td>
                  <td className="py-2 pr-3"><Badge variant="outline">{p.status}</Badge></td>
                  <td className="py-2 pr-3">{p.metricCount}</td>
                  <td className="py-2 pr-3 flex gap-1 flex-wrap">
                    {canEdit && <Button size="sm" variant="outline" onClick={() => openEditPlan(p)}>Editar</Button>}
                    {canEdit && p.availableActions.map(a => <Button key={a} size="sm" variant="outline" onClick={() => transitionPlan(p.id, a)}>{a}</Button>)}
                    {canDelete && (p.status === "DRAFT" || p.status === "CANCELLED") && <Button size="sm" variant="ghost" onClick={() => deletePlan(p.id)}><Trash2 className="h-4 w-4" /></Button>}
                  </td>
                </tr>
              ))}
              {plans.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">Nenhum plano.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "metrics" && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Métricas</h2>
            <Button size="sm" variant="outline" onClick={() => exportCsv(metrics, "metrics-sustainability")}>Exportar CSV</Button>
            {canCreate && <Button size="sm" onClick={() => setMetricOpen(true)}><Plus className="mr-1 h-4 w-4" /> Nova métrica</Button>}
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 pr-3">Código</th><th className="py-2 pr-3">Nome</th><th className="py-2 pr-3">Unidade</th><th className="py-2 pr-3">Categoria</th><th className="py-2 pr-3">Baselines</th><th className="py-2 pr-3">Metas</th><th className="py-2 pr-3">Medições</th><th className="py-2 pr-3">Ações</th></tr></thead>
            <tbody>
              {metrics.map(m => (
                <tr key={m.id} className="border-b">
                  <td className="py-2 pr-3 font-mono">{m.code}</td>
                  <td className="py-2 pr-3">{m.name}</td>
                  <td className="py-2 pr-3">{m.unit}</td>
                  <td className="py-2 pr-3">{m.category ?? "—"}</td>
                  <td className="py-2 pr-3">{m.baselineCount}</td>
                  <td className="py-2 pr-3">{m.targetCount}</td>
                  <td className="py-2 pr-3">{m.measurementCount}</td>
                  <td className="py-2 pr-3">{canDelete && <Button size="sm" variant="ghost" onClick={() => deleteMetric(m.id)}><Trash2 className="h-4 w-4" /></Button>}</td>
                </tr>
              ))}
              {metrics.length === 0 && <tr><td colSpan={8} className="py-4 text-center text-muted-foreground">Nenhuma métrica.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "baselines" && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Baselines</h2>
            {canCreate && <Button size="sm" onClick={() => setBaselineOpen(true)}><Plus className="mr-1 h-4 w-4" /> Novo baseline</Button>}
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 pr-3">Código</th><th className="py-2 pr-3">Métrica</th><th className="py-2 pr-3">Valor</th><th className="py-2 pr-3">Data</th><th className="py-2 pr-3">Fonte</th><th className="py-2 pr-3">Ações</th></tr></thead>
            <tbody>
              {baselines.map(b => (
                <tr key={b.id} className="border-b">
                  <td className="py-2 pr-3 font-mono">{b.code}</td>
                  <td className="py-2 pr-3">{b.metricId}</td>
                  <td className="py-2 pr-3">{b.value}</td>
                  <td className="py-2 pr-3">{b.recordedAt}</td>
                  <td className="py-2 pr-3">{b.source ?? "—"}</td>
                  <td className="py-2 pr-3">{canDelete && <Button size="sm" variant="ghost" onClick={() => deleteBaseline(b.id)}><Trash2 className="h-4 w-4" /></Button>}</td>
                </tr>
              ))}
              {baselines.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">Nenhum baseline.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "targets" && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Metas</h2>
            {canCreate && <Button size="sm" onClick={() => setTargetOpen(true)}><Plus className="mr-1 h-4 w-4" /> Nova meta</Button>}
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 pr-3">Código</th><th className="py-2 pr-3">Métrica</th><th className="py-2 pr-3">Valor alvo</th><th className="py-2 pr-3">Prazo</th><th className="py-2 pr-3">Ações</th></tr></thead>
            <tbody>
              {targets.map(t => (
                <tr key={t.id} className="border-b">
                  <td className="py-2 pr-3 font-mono">{t.code}</td>
                  <td className="py-2 pr-3">{t.metricId}</td>
                  <td className="py-2 pr-3">{t.targetValue}</td>
                  <td className="py-2 pr-3">{t.dueDate ?? "—"}</td>
                  <td className="py-2 pr-3">{canDelete && <Button size="sm" variant="ghost" onClick={() => deleteTarget(t.id)}><Trash2 className="h-4 w-4" /></Button>}</td>
                </tr>
              ))}
              {targets.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">Nenhuma meta.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "measurements" && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Medições</h2>
            {canCreate && <Button size="sm" onClick={() => setMeasurementOpen(true)}><Plus className="mr-1 h-4 w-4" /> Nova medição</Button>}
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 pr-3">Código</th><th className="py-2 pr-3">Métrica</th><th className="py-2 pr-3">Valor</th><th className="py-2 pr-3">Data</th><th className="py-2 pr-3">Ações</th></tr></thead>
            <tbody>
              {measurements.map(m => (
                <tr key={m.id} className="border-b">
                  <td className="py-2 pr-3 font-mono">{m.code}</td>
                  <td className="py-2 pr-3">{m.metricId}</td>
                  <td className="py-2 pr-3">{m.value}</td>
                  <td className="py-2 pr-3">{m.measuredAt}</td>
                  <td className="py-2 pr-3">{canDelete && <Button size="sm" variant="ghost" onClick={() => deleteMeasurement(m.id)}><Trash2 className="h-4 w-4" /></Button>}</td>
                </tr>
              ))}
              {measurements.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">Nenhuma medição.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "wastes" && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Resíduos</h2>
            <Button size="sm" variant="outline" onClick={() => exportCsv(wastes, "wastes-sustainability")}>Exportar CSV</Button>
            {canCreate && <Button size="sm" onClick={() => setWasteOpen(true)}><Plus className="mr-1 h-4 w-4" /> Novo resíduo</Button>}
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 pr-3">Código</th><th className="py-2 pr-3">Tipo</th><th className="py-2 pr-3">Quantidade</th><th className="py-2 pr-3">Unidade</th><th className="py-2 pr-3">Destino</th><th className="py-2 pr-3">Data</th><th className="py-2 pr-3">Ações</th></tr></thead>
            <tbody>
              {wastes.map(w => (
                <tr key={w.id} className="border-b">
                  <td className="py-2 pr-3 font-mono">{w.code}</td>
                  <td className="py-2 pr-3">{w.wasteType}</td>
                  <td className="py-2 pr-3">{w.quantity}</td>
                  <td className="py-2 pr-3">{w.unit}</td>
                  <td className="py-2 pr-3">{w.destination ?? "—"}</td>
                  <td className="py-2 pr-3">{w.recordedAt}</td>
                  <td className="py-2 pr-3">{canDelete && <Button size="sm" variant="ghost" onClick={() => deleteWaste(w.id)}><Trash2 className="h-4 w-4" /></Button>}</td>
                </tr>
              ))}
              {wastes.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-muted-foreground">Nenhum resíduo.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}

      {editPlan && (
        <Dialog open={editPlanOpen} title="Editar plano de sustentabilidade" onClose={() => { setEditPlanOpen(false); setEditPlan(null); }}>
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
      <Dialog open={planOpen} title="Novo plano de sustentabilidade" onClose={() => setPlanOpen(false)}>
        <div className="space-y-3 p-4">
          <div><Label>Título</Label><Input value={planForm.title} onChange={e => setPlanForm({ ...planForm, title: e.target.value })} /></div>
          <div><Label>Descrição</Label><Input value={planForm.description} onChange={e => setPlanForm({ ...planForm, description: e.target.value })} /></div>
          <div><Label>Responsável</Label>
            <select className="w-full rounded border p-2" value={planForm.ownerId} onChange={e => setPlanForm({ ...planForm, ownerId: e.target.value })}>
              <option value="">—</option>{members.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Início</Label><Input type="date" value={planForm.startDate} onChange={e => setPlanForm({ ...planForm, startDate: e.target.value })} /></div>
            <div><Label>Fim previsto</Label><Input type="date" value={planForm.plannedEndDate} onChange={e => setPlanForm({ ...planForm, plannedEndDate: e.target.value })} /></div>
          </div>
          <div><Label>WBS</Label>
            <select className="w-full rounded border p-2" value={planForm.wbsNodeId} onChange={e => setPlanForm({ ...planForm, wbsNodeId: e.target.value })}>
              <option value="">—</option>{wbsNodes.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
          </div>
          <div><Label>Atividade</Label>
            <select className="w-full rounded border p-2" value={planForm.activityId} onChange={e => setPlanForm({ ...planForm, activityId: e.target.value })}>
              <option value="">—</option>{activities.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPlanOpen(false)}>Cancelar</Button>
            <Button onClick={createPlan} disabled={isPending || !planForm.title}>Criar</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={metricOpen} title="Nova métrica" onClose={() => setMetricOpen(false)}>
        <div className="space-y-3 p-4">
          <div><Label>Plano (opcional)</Label>
            <select className="w-full rounded border p-2" value={metricForm.planId} onChange={e => setMetricForm({ ...metricForm, planId: e.target.value })}>
              <option value="">—</option>{plans.map(p => <option key={p.id} value={p.id}>{p.code} — {p.title}</option>)}
            </select>
          </div>
          <div><Label>Nome</Label><Input value={metricForm.name} onChange={e => setMetricForm({ ...metricForm, name: e.target.value })} /></div>
          <div><Label>Unidade</Label><Input value={metricForm.unit} onChange={e => setMetricForm({ ...metricForm, unit: e.target.value })} /></div>
          <div><Label>Categoria</Label><Input value={metricForm.category} onChange={e => setMetricForm({ ...metricForm, category: e.target.value })} /></div>
          <div><Label>Descrição</Label><Input value={metricForm.description} onChange={e => setMetricForm({ ...metricForm, description: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMetricOpen(false)}>Cancelar</Button>
            <Button onClick={createMetric} disabled={isPending || !metricForm.name || !metricForm.unit}>Criar</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={wasteOpen} title="Novo resíduo" onClose={() => setWasteOpen(false)}>
        <div className="space-y-3 p-4">
          <div><Label>Tipo de resíduo</Label><Input value={wasteForm.wasteType} onChange={e => setWasteForm({ ...wasteForm, wasteType: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Quantidade</Label><Input type="number" value={wasteForm.quantity} onChange={e => setWasteForm({ ...wasteForm, quantity: e.target.value })} /></div>
            <div><Label>Unidade</Label><Input value={wasteForm.unit} onChange={e => setWasteForm({ ...wasteForm, unit: e.target.value })} /></div>
          </div>
          <div><Label>Destino</Label><Input value={wasteForm.destination} onChange={e => setWasteForm({ ...wasteForm, destination: e.target.value })} /></div>
          <div><Label>Data</Label><Input type="date" value={wasteForm.recordedAt} onChange={e => setWasteForm({ ...wasteForm, recordedAt: e.target.value })} /></div>
          <div><Label>WBS</Label>
            <select className="w-full rounded border p-2" value={wasteForm.wbsNodeId} onChange={e => setWasteForm({ ...wasteForm, wbsNodeId: e.target.value })}>
              <option value="">—</option>{wbsNodes.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
          </div>
          <div><Label>Atividade</Label>
            <select className="w-full rounded border p-2" value={wasteForm.activityId} onChange={e => setWasteForm({ ...wasteForm, activityId: e.target.value })}>
              <option value="">—</option>{activities.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
          <div><Label>Notas</Label><Input value={wasteForm.notes} onChange={e => setWasteForm({ ...wasteForm, notes: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setWasteOpen(false)}>Cancelar</Button>
            <Button onClick={createWaste} disabled={isPending || !wasteForm.wasteType || !wasteForm.quantity || !wasteForm.unit || !wasteForm.recordedAt}>Criar</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={baselineOpen} title="Novo baseline" onClose={() => setBaselineOpen(false)}>
        <div className="space-y-3 p-4">
          <div><Label>Métrica</Label>
            <select className="w-full rounded border p-2" value={baselineForm.metricId} onChange={e => setBaselineForm({ ...baselineForm, metricId: e.target.value })}>
              <option value="">—</option>{metrics.map(m => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
            </select>
          </div>
          <div><Label>Valor</Label><Input type="number" value={baselineForm.value} onChange={e => setBaselineForm({ ...baselineForm, value: e.target.value })} /></div>
          <div><Label>Data</Label><Input type="date" value={baselineForm.recordedAt} onChange={e => setBaselineForm({ ...baselineForm, recordedAt: e.target.value })} /></div>
          <div><Label>Fonte</Label><Input value={baselineForm.source} onChange={e => setBaselineForm({ ...baselineForm, source: e.target.value })} /></div>
          <div><Label>Notas</Label><Input value={baselineForm.notes} onChange={e => setBaselineForm({ ...baselineForm, notes: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBaselineOpen(false)}>Cancelar</Button>
            <Button onClick={createBaseline} disabled={isPending || !baselineForm.metricId || !baselineForm.value || !baselineForm.recordedAt}>Criar</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={targetOpen} title="Nova meta" onClose={() => setTargetOpen(false)}>
        <div className="space-y-3 p-4">
          <div><Label>Métrica</Label>
            <select className="w-full rounded border p-2" value={targetForm.metricId} onChange={e => setTargetForm({ ...targetForm, metricId: e.target.value })}>
              <option value="">—</option>{metrics.map(m => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
            </select>
          </div>
          <div><Label>Valor alvo</Label><Input type="number" value={targetForm.targetValue} onChange={e => setTargetForm({ ...targetForm, targetValue: e.target.value })} /></div>
          <div><Label>Prazo</Label><Input type="date" value={targetForm.dueDate} onChange={e => setTargetForm({ ...targetForm, dueDate: e.target.value })} /></div>
          <div><Label>Notas</Label><Input value={targetForm.notes} onChange={e => setTargetForm({ ...targetForm, notes: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTargetOpen(false)}>Cancelar</Button>
            <Button onClick={createTarget} disabled={isPending || !targetForm.metricId || !targetForm.targetValue}>Criar</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={measurementOpen} title="Nova medição" onClose={() => setMeasurementOpen(false)}>
        <div className="space-y-3 p-4">
          <div><Label>Métrica</Label>
            <select className="w-full rounded border p-2" value={measurementForm.metricId} onChange={e => setMeasurementForm({ ...measurementForm, metricId: e.target.value })}>
              <option value="">—</option>{metrics.map(m => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
            </select>
          </div>
          <div><Label>Valor</Label><Input type="number" value={measurementForm.value} onChange={e => setMeasurementForm({ ...measurementForm, value: e.target.value })} /></div>
          <div><Label>Data</Label><Input type="date" value={measurementForm.measuredAt} onChange={e => setMeasurementForm({ ...measurementForm, measuredAt: e.target.value })} /></div>
          <div><Label>WBS</Label>
            <select className="w-full rounded border p-2" value={measurementForm.wbsNodeId} onChange={e => setMeasurementForm({ ...measurementForm, wbsNodeId: e.target.value })}>
              <option value="">—</option>{wbsNodes.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
          </div>
          <div><Label>Atividade</Label>
            <select className="w-full rounded border p-2" value={measurementForm.activityId} onChange={e => setMeasurementForm({ ...measurementForm, activityId: e.target.value })}>
              <option value="">—</option>{activities.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
          <div><Label>Notas</Label><Input value={measurementForm.notes} onChange={e => setMeasurementForm({ ...measurementForm, notes: e.target.value })} /></div>
          <div><Label>Evidência</Label><Input value={measurementForm.evidenceNotes} onChange={e => setMeasurementForm({ ...measurementForm, evidenceNotes: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMeasurementOpen(false)}>Cancelar</Button>
            <Button onClick={createMeasurement} disabled={isPending || !measurementForm.metricId || !measurementForm.value || !measurementForm.measuredAt}>Criar</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}