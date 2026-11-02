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

  const [planOpen, setPlanOpen] = useState(false);
  const [metricOpen, setMetricOpen] = useState(false);
  const [wasteOpen, setWasteOpen] = useState(false);
  const [planForm, setPlanForm] = useState({ title: "", description: "", ownerId: "", startDate: "", plannedEndDate: "", wbsNodeId: "", activityId: "" });
  const [metricForm, setMetricForm] = useState({ planId: "", name: "", unit: "", category: "", description: "" });
  const [wasteForm, setWasteForm] = useState({ wasteType: "", quantity: "", unit: "", destination: "", recordedAt: "", wbsNodeId: "", activityId: "", notes: "" });

  const refresh = () => startTransition(() => router.refresh());

  const createPlan = async () => {
    await apiRequest(`/api/v1/projects/${projectId}/sustainability/plans`, { method: "POST", body: JSON.stringify({ title: planForm.title, description: planForm.description || undefined, ownerId: planForm.ownerId || null, startDate: planForm.startDate || undefined, plannedEndDate: planForm.plannedEndDate || undefined, wbsNodeId: planForm.wbsNodeId || null, activityId: planForm.activityId || null }) });
    setPlanOpen(false); setPlanForm({ title: "", description: "", ownerId: "", startDate: "", plannedEndDate: "", wbsNodeId: "", activityId: "" }); refresh();
  };
  const createMetric = async () => {
    await apiRequest(`/api/v1/projects/${projectId}/sustainability/metrics`, { method: "POST", body: JSON.stringify({ planId: metricForm.planId || null, name: metricForm.name, unit: metricForm.unit, category: metricForm.category || undefined, description: metricForm.description || undefined }) });
    setMetricOpen(false); setMetricForm({ planId: "", name: "", unit: "", category: "", description: "" }); refresh();
  };
  const createWaste = async () => {
    await apiRequest(`/api/v1/projects/${projectId}/sustainability/wastes`, { method: "POST", body: JSON.stringify({ wasteType: wasteForm.wasteType, quantity: Number(wasteForm.quantity), unit: wasteForm.unit, destination: wasteForm.destination || undefined, recordedAt: wasteForm.recordedAt, wbsNodeId: wasteForm.wbsNodeId || null, activityId: wasteForm.activityId || null, notes: wasteForm.notes || undefined }) });
    setWasteOpen(false); setWasteForm({ wasteType: "", quantity: "", unit: "", destination: "", recordedAt: "", wbsNodeId: "", activityId: "", notes: "" }); refresh();
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
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Planos de sustentabilidade (PSP)</h2>
            {canCreate && <Button size="sm" onClick={() => setPlanOpen(true)}><Plus className="mr-1 h-4 w-4" /> Novo plano</Button>}
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 pr-3">Código</th><th className="py-2 pr-3">Título</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Métricas</th><th className="py-2 pr-3">Ações</th></tr></thead>
            <tbody>
              {plans.map(p => (
                <tr key={p.id} className="border-b">
                  <td className="py-2 pr-3 font-mono">{p.code}</td>
                  <td className="py-2 pr-3">{p.title}</td>
                  <td className="py-2 pr-3"><Badge variant="outline">{p.status}</Badge></td>
                  <td className="py-2 pr-3">{p.metricCount}</td>
                  <td className="py-2 pr-3 flex gap-1 flex-wrap">
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
          <h2 className="mb-3 text-sm font-semibold">Baselines</h2>
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
          <h2 className="mb-3 text-sm font-semibold">Metas</h2>
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
          <h2 className="mb-3 text-sm font-semibold">Medições</h2>
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
    </div>
  );
}