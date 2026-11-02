import { getTenantContext } from "@/core/tenant";
import { getProjectDashboard } from "@/modules/dashboard/project";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { CurveSChart, BurndownChart, RiskHeatmap } from "@/components/dashboard/project-charts";

function fmt(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function ProjetoDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ asOf?: string }>;
}) {
  const context = (await getTenantContext())!;
  const { id } = await params;
  const sp = await searchParams;
  const asOf = sp.asOf && /^\d{4}-\d{2}-\d{2}$/.test(sp.asOf)
    ? sp.asOf
    : new Date().toISOString().slice(0, 10);

  const data = await getProjectDashboard(context.organizationId, id, asOf);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard do Projeto</h1>
          <p className="text-sm text-muted-foreground">Reporte as-of {asOf}.</p>
        </div>
        <form method="get" className="flex items-center gap-2">
          <label className="text-sm" htmlFor="asOf">Data de reporte</label>
          <input id="asOf" name="asOf" type="date" defaultValue={asOf} className="rounded border px-2 py-1 text-sm" />
          <button type="submit" className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground">Aplicar</button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">BAC</CardTitle></CardHeader><CardContent><div className="text-lg font-bold">{fmt(data.kpis.bac)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">PV</CardTitle></CardHeader><CardContent><div className="text-lg font-bold">{fmt(data.kpis.pv)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">EV</CardTitle></CardHeader><CardContent><div className="text-lg font-bold">{fmt(data.kpis.ev)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">AC</CardTitle></CardHeader><CardContent><div className="text-lg font-bold">{fmt(data.kpis.ac)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">SPI</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{data.kpis.spi ?? "—"}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">CPI</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{data.kpis.cpi ?? "—"}</div></CardContent></Card>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">% Plan.</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{data.kpis.plannedPct.toFixed(1)}%</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">% Real</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{data.kpis.actualPct.toFixed(1)}%</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">Início (plan.)</CardTitle></CardHeader><CardContent><div className="text-sm">{data.kpis.plannedStart ?? "—"}</div><div className="text-xs text-muted-foreground">Real: {data.kpis.actualStart ?? "—"}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">Fim (plan.)</CardTitle></CardHeader><CardContent><div className="text-sm">{data.kpis.plannedEnd ?? "—"}</div><div className="text-xs text-muted-foreground">Real: {data.kpis.actualEnd ?? "—"}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Alertas</CardTitle></CardHeader>
        <CardContent>
          <ul className="list-disc pl-5 text-sm">
            {data.alerts.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Curva S (PV / EV / AC)</CardTitle></CardHeader>
        <CardContent>
          <CurveSChart data={data.curve} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Burndown de atividades</CardTitle></CardHeader>
        <CardContent>
          <BurndownChart data={data.burndown} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Gantt resumido (atividades)</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-2 pr-4">Código</th>
                  <th className="py-2 pr-4">Nome</th>
                  <th className="py-2 pr-4">Início</th>
                  <th className="py-2 pr-4">Fim</th>
                  <th className="py-2 pr-4 text-right">Dur.</th>
                  <th className="py-2 pr-4 text-right">Float</th>
                  <th className="py-2 pr-4 text-right">Avanço</th>
                  <th className="py-2 pr-4">Crítico</th>
                </tr>
              </thead>
              <tbody>
                {data.gantt.map((g) => (
                  <tr key={g.code} className="border-b">
                    <td className="py-1 pr-4 font-medium">{g.code}</td>
                    <td className="py-1 pr-4">{g.name}</td>
                    <td className="py-1 pr-4">{g.start ?? "—"}</td>
                    <td className="py-1 pr-4">{g.end ?? "—"}</td>
                    <td className="py-1 pr-4 text-right">{g.duration}</td>
                    <td className="py-1 pr-4 text-right">{g.float}</td>
                    <td className="py-1 pr-4 text-right">{g.progress}%</td>
                    <td className="py-1 pr-4">{g.critical ? <Badge variant="destructive">Sim</Badge> : "—"}</td>
                  </tr>
                ))}
                {data.gantt.length === 0 && (
                  <tr><td colSpan={8} className="py-4 text-center text-muted-foreground">Sem atividades.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Heat map de riscos (probabilidade x impacto)</CardTitle></CardHeader>
        <CardContent>
          <RiskHeatmap cells={data.riskHeatmap} />
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">
        <Link href={`/projetos/${id}`} className="underline">Voltar ao projeto</Link>
      </div>
    </div>
  );
}