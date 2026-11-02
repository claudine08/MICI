import { getTenantContext } from "@/core/tenant";
import { getPortfolioDashboard } from "@/modules/dashboard/portfolio";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

function fmt(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function colorForRatio(ratio: number | null): string {
  if (ratio === null) return "text-muted-foreground";
  if (ratio >= 1) return "text-emerald-600";
  if (ratio >= 0.9) return "text-amber-600";
  return "text-red-600";
}

export default async function PainelPage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  const context = (await getTenantContext())!;
  const sp = await searchParams;
  const asOf = sp.asOf && /^\d{4}-\d{2}-\d{2}$/.test(sp.asOf)
    ? sp.asOf
    : new Date().toISOString().slice(0, 10);

  const data = await getPortfolioDashboard(context.organizationId, asOf);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard de Projetos</h1>
          <p className="text-sm text-muted-foreground">
            Visão portfólio — reporte as-of {asOf}. Power BI / Jira style.
          </p>
        </div>
        <form method="get" className="flex items-center gap-2">
          <label className="text-sm" htmlFor="asOf">Data de reporte</label>
          <input
            id="asOf"
            name="asOf"
            type="date"
            defaultValue={asOf}
            className="rounded border px-2 py-1 text-sm"
          />
          <button type="submit" className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground">
            Aplicar
          </button>
        </form>
      </div>

      {/* KPIs agregados */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs">Projetos</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{data.kpis.totalProjects}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs">BAC (planejado)</CardTitle></CardHeader>
          <CardContent><div className="text-lg font-bold">{fmt(data.kpis.totalBac)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs">PV (planejado até {asOf})</CardTitle></CardHeader>
          <CardContent><div className="text-lg font-bold">{fmt(data.kpis.totalPv)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs">EV (realizado físico)</CardTitle></CardHeader>
          <CardContent><div className="text-lg font-bold">{fmt(data.kpis.totalEv)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs">AC (custo real)</CardTitle></CardHeader>
          <CardContent><div className="text-lg font-bold">{fmt(data.kpis.totalAc)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs">SPI</CardTitle></CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${colorForRatio(data.kpis.spi)}`}>
              {data.kpis.spi ?? "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs">CPI</CardTitle></CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${colorForRatio(data.kpis.cpi)}`}>
              {data.kpis.cpi ?? "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de projetos */}
      <Card>
        <CardHeader>
          <CardTitle>Projetos</CardTitle>
          <CardDescription>
            Datas (planejado), custos (BAC/PV/EV/AC) e percentuais para a data de reporte.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4">Código</th>
                  <th className="py-2 pr-4">Nome</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Fase</th>
                  <th className="py-2 pr-4">Início (plan.)</th>
                  <th className="py-2 pr-4">Fim (plan.)</th>
                  <th className="py-2 pr-4 text-right">BAC</th>
                  <th className="py-2 pr-4 text-right">PV</th>
                  <th className="py-2 pr-4 text-right">EV</th>
                  <th className="py-2 pr-4 text-right">AC</th>
                  <th className="py-2 pr-4 text-right">% Plan.</th>
                  <th className="py-2 pr-4 text-right">% Real</th>
                  <th className="py-2 pr-4 text-right">SPI</th>
                  <th className="py-2 pr-4 text-right">CPI</th>
                </tr>
              </thead>
              <tbody>
                {data.projects.map((p) => (
                  <tr key={p.id} className="border-b">
                    <td className="py-2 pr-4 font-medium">
                      <Link href={`/projetos/${p.id}`} className="hover:underline">
                        {p.code}
                      </Link>
                      <Link href={`/projetos/${p.id}/dashboard`} className="ml-2 text-xs text-primary hover:underline">
                        📊
                      </Link>
                    </td>
                    <td className="py-2 pr-4">{p.name}</td>
                    <td className="py-2 pr-4">
                      <Badge variant="outline">{p.status}</Badge>
                    </td>
                    <td className="py-2 pr-4">{p.currentPhase}</td>
                    <td className="py-2 pr-4">{p.plannedStart ?? "—"}</td>
                    <td className="py-2 pr-4">{p.plannedEnd ?? "—"}</td>
                    <td className="py-2 pr-4 text-right">{fmt(p.bac)}</td>
                    <td className="py-2 pr-4 text-right">{fmt(p.pv)}</td>
                    <td className="py-2 pr-4 text-right">{fmt(p.ev)}</td>
                    <td className="py-2 pr-4 text-right">{fmt(p.ac)}</td>
                    <td className="py-2 pr-4 text-right">{p.plannedPct.toFixed(1)}%</td>
                    <td className="py-2 pr-4 text-right">{p.actualPct.toFixed(1)}%</td>
                    <td className={`py-2 pr-4 text-right ${colorForRatio(p.spi)}`}>
                      {p.spi ?? "—"}
                    </td>
                    <td className={`py-2 pr-4 text-right ${colorForRatio(p.cpi)}`}>
                      {p.cpi ?? "—"}
                    </td>
                  </tr>
                ))}
                {data.projects.length === 0 && (
                  <tr>
                    <td colSpan={14} className="py-4 text-center text-muted-foreground">
                      Nenhum projeto cadastrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">
        PV = BAC × (dias decorridos / duração) (time-phased linear). EV = BAC × avanço físico médio (schedule). AC = soma de CostActual.
        SPI = EV/PV · CPI = EV/AC. Drill-down, curva S, Gantt, burndown e heat map de riscos nas próximas fatias (E19).
        <Link href="/administracao" className="ml-2 underline">Administração</Link>
      </div>
    </div>
  );
}