import { getTenantContext } from "@/core/tenant";
import { getPortfolioDashboard } from "@/modules/dashboard/portfolio";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

function fmt(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function ExecutivoPage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  const context = (await getTenantContext())!;
  const sp = await searchParams;
  const asOf = sp.asOf && /^\d{4}-\d{2}-\d{2}$/.test(sp.asOf) ? sp.asOf : new Date().toISOString().slice(0, 10);
  const data = await getPortfolioDashboard(context.organizationId, asOf);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard Executivo</h1>
        <p className="text-sm text-muted-foreground">
          Visão consolidada do portfólio — reporte as-of {asOf}. KPIs agregados de custo, prazo e avanço.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">Projetos</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{data.kpis.totalProjects}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">BAC</CardTitle></CardHeader><CardContent><div className="text-lg font-bold">{fmt(data.kpis.totalBac)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">PV</CardTitle></CardHeader><CardContent><div className="text-lg font-bold">{fmt(data.kpis.totalPv)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">EV</CardTitle></CardHeader><CardContent><div className="text-lg font-bold">{fmt(data.kpis.totalEv)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">AC</CardTitle></CardHeader><CardContent><div className="text-lg font-bold">{fmt(data.kpis.totalAc)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">SPI</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{data.kpis.spi ?? "—"}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">CPI</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{data.kpis.cpi ?? "—"}</div></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Projetos</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-4">Código</th><th className="py-2 pr-4">Nome</th><th className="py-2 pr-4">Status</th><th className="py-2 pr-4">Fase</th><th className="py-2 pr-4 text-right">BAC</th><th className="py-2 pr-4 text-right">PV</th><th className="py-2 pr-4 text-right">EV</th><th className="py-2 pr-4 text-right">AC</th><th className="py-2 pr-4 text-right">SPI</th><th className="py-2 pr-4 text-right">CPI</th>
              </tr></thead>
              <tbody>
                {data.projects.map((p) => (
                  <tr key={p.id} className="border-b">
                    <td className="py-2 pr-4 font-medium"><Link href={`/projetos/${p.id}/dashboard`} className="hover:underline">{p.code}</Link></td>
                    <td className="py-2 pr-4">{p.name}</td>
                    <td className="py-2 pr-4">{p.status}</td>
                    <td className="py-2 pr-4">{p.currentPhase}</td>
                    <td className="py-2 pr-4 text-right">{fmt(p.bac)}</td>
                    <td className="py-2 pr-4 text-right">{fmt(p.pv)}</td>
                    <td className="py-2 pr-4 text-right">{fmt(p.ev)}</td>
                    <td className="py-2 pr-4 text-right">{fmt(p.ac)}</td>
                    <td className="py-2 pr-4 text-right">{p.spi ?? "—"}</td>
                    <td className="py-2 pr-4 text-right">{p.cpi ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <form method="get" className="flex items-center gap-2">
        <label className="text-sm" htmlFor="asOf">Data de reporte</label>
        <input id="asOf" name="asOf" type="date" defaultValue={asOf} className="rounded border px-2 py-1 text-sm" />
        <button type="submit" className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground">Aplicar</button>
      </form>
    </div>
  );
}