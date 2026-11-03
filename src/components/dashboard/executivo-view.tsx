"use client";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ProjectRow { id: string; code: string; name: string; status: string; currentPhase: string; bac: number; pv: number; ev: number; ac: number; spi: number | null; cpi: number | null; }
interface Props { kpis: { totalProjects: number; totalBac: number; totalPv: number; totalEv: number; totalAc: number; spi: number | null; cpi: number | null }; projects: ProjectRow[]; asOf: string; }

const STATUS_COLORS: Record<string, string> = { DRAFT: "#94a3b8", QUALIFICATION: "#f59e0b", ACTIVE: "#10b981", ON_HOLD: "#f97316", COMPLETED: "#3b82f6", CANCELLED: "#ef4444", ARCHIVED: "#6b7280" };

export function ExecutivoView({ kpis, projects, asOf }: Props) {
  const statusCounts = Object.entries(
    projects.reduce((acc, p) => { acc[p.status] = (acc[p.status] ?? 0) + 1; return acc; }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value }));

  const spiData = projects.map((p) => ({ name: p.code, spi: p.spi ?? 0, cpi: p.cpi ?? 0 }));

  const criticalProjects = projects.filter((p) => (p.spi !== null && p.spi < 0.9) || (p.cpi !== null && p.cpi < 0.9));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard Executivo</h1>
        <p className="text-sm text-muted-foreground">Visão estratégica do portfólio — reporte as-of {asOf}.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">Projetos</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{kpis.totalProjects}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">BAC</CardTitle></CardHeader><CardContent><div className="text-lg font-bold">{kpis.totalBac.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">PV</CardTitle></CardHeader><CardContent><div className="text-lg font-bold">{kpis.totalPv.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">EV</CardTitle></CardHeader><CardContent><div className="text-lg font-bold">{kpis.totalEv.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">AC</CardTitle></CardHeader><CardContent><div className="text-lg font-bold">{kpis.totalAc.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">SPI</CardTitle></CardHeader><CardContent><div className={`text-2xl font-bold ${kpis.spi !== null && kpis.spi >= 1 ? "text-emerald-600" : "text-red-600"}`}>{kpis.spi ?? "—"}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">CPI</CardTitle></CardHeader><CardContent><div className={`text-2xl font-bold ${kpis.cpi !== null && kpis.cpi >= 1 ? "text-emerald-600" : "text-red-600"}`}>{kpis.cpi ?? "—"}</div></CardContent></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Distribuição de status</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusCounts} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {statusCounts.map((entry, i) => <Cell key={i} fill={STATUS_COLORS[entry.name] ?? "#6b7280"} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>SPI / CPI por projeto</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={spiData}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="spi" fill="#3b82f6" name="SPI" />
                <Bar dataKey="cpi" fill="#10b981" name="CPI" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Projetos críticos (SPI ou CPI &lt; 0.9)</CardTitle></CardHeader>
        <CardContent>
          {criticalProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum projeto crítico.</p>
          ) : (
            <ul className="space-y-2">
              {criticalProjects.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded border p-2">
                  <span className="font-medium">{p.code} — {p.name}</span>
                  <span className="text-sm">SPI: {p.spi ?? "—"} · CPI: {p.cpi ?? "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}