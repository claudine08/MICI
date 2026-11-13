"use client";
import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface ProjectRow { id: string; code: string; name: string; status: string; currentPhase: string; plannedStart: string | null; plannedEnd: string | null; bac: number; pv: number; ev: number; ac: number; plannedPct: number; actualPct: number; spi: number | null; cpi: number | null; openRfis: number; openPunchItems: number; delayed: boolean; delayedActivities: string[]; }
interface Kpis { totalProjects: number; delayedProjects: number; totalBac: number; totalPv: number; totalEv: number; totalAc: number; spi: number | null; cpi: number | null; openRfis: number; openPunchItems: number; }
interface Props { kpis: Kpis; projects: ProjectRow[]; asOf: string; }

function fmt(n: number): string { return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function colorForRatio(r: number | null): string { if (r === null) return "text-muted-foreground"; if (r >= 1) return "text-emerald-600"; if (r >= 0.9) return "text-amber-600"; return "text-red-600"; }

export function PainelView({ kpis, projects, asOf }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [rfiFilter, setRfiFilter] = useState(false);
  const [punchFilter, setPunchFilter] = useState(false);

  const filtered = projects.filter((p) => {
    if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
    if (rfiFilter && p.openRfis <= 0) return false;
    if (punchFilter && p.openPunchItems <= 0) return false;
    if (search && !`${p.code} ${p.name}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const statuses = Array.from(new Set(projects.map((p) => p.status)));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard de Projetos</h1>
          <p className="text-sm text-muted-foreground">Visão operacional do portfólio — reporte as-of {asOf}.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">Projetos</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{kpis.totalProjects}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">Em atraso</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-red-600">{kpis.delayedProjects}</div></CardContent></Card>
        <Card className={`cursor-pointer transition-colors hover:border-primary/50 ${rfiFilter ? "border-primary" : ""}`} onClick={() => setRfiFilter((v) => !v)}><CardHeader className="pb-2"><CardTitle className="text-xs">RFI abertos</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{kpis.openRfis}</div><div className="text-[10px] text-muted-foreground">{rfiFilter ? "filtrando" : "clique para filtrar"}</div></CardContent></Card>
        <Card className={`cursor-pointer transition-colors hover:border-primary/50 ${punchFilter ? "border-primary" : ""}`} onClick={() => setPunchFilter((v) => !v)}><CardHeader className="pb-2"><CardTitle className="text-xs">Punch items abertos</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{kpis.openPunchItems}</div><div className="text-[10px] text-muted-foreground">{punchFilter ? "filtrando" : "clique para filtrar"}</div></CardContent></Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Buscar projeto..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <select className="rounded border p-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="ALL">Todos os status</option>
          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} de {projects.length} projetos</span>
        {(rfiFilter || punchFilter) && (
          <button
            type="button"
            onClick={() => { setRfiFilter(false); setPunchFilter(false); }}
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Projetos por fase */}
      <Card>
        <CardHeader><CardTitle>Projetos por fase (integrado com gates)</CardTitle><CardDescription>Agrupamento por fase atual do projeto.</CardDescription></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from(new Set(filtered.map((p) => p.currentPhase))).sort().map((phase) => {
              const inPhase = filtered.filter((p) => p.currentPhase === phase);
              return (
                <div key={phase} className="rounded border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-medium">Fase {phase}</span>
                    <span className="text-xs text-muted-foreground">{inPhase.length} projeto(s)</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {inPhase.map((p) => (
                      <Link key={p.id} href={`/projetos/${p.id}`} title={p.delayed && p.delayedActivities.length ? `Atividades em atraso:\n${p.delayedActivities.join("\n")}` : undefined} className={`rounded border px-2 py-1 text-xs hover:bg-muted ${p.delayed ? "border-red-300 bg-red-50 text-red-600 font-semibold animate-pulse" : ""}`}>
                        {p.code} — {p.name}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <p className="text-sm text-muted-foreground">Nenhum projeto.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Projetos</CardTitle>
          <CardDescription>Operacional: datas, custos e percentuais por data de reporte.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4">Código</th><th className="py-2 pr-4">Nome</th><th className="py-2 pr-4">Status</th><th className="py-2 pr-4">Fase</th><th className="py-2 pr-4 text-right">Issues</th>
                  <th className="py-2 pr-4">Início (plan.)</th><th className="py-2 pr-4">Fim (plan.)</th>
                  <th className="py-2 pr-4 text-right">BAC</th><th className="py-2 pr-4 text-right">PV</th><th className="py-2 pr-4 text-right">EV</th><th className="py-2 pr-4 text-right">AC</th>
                  <th className="py-2 pr-4 text-right">% Plan.</th><th className="py-2 pr-4 text-right">% Real</th><th className="py-2 pr-4 text-right">SPI</th><th className="py-2 pr-4 text-right">CPI</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b">
                    <td className="py-2 pr-4 font-medium">
                      <Link href={`/projetos/${p.id}`} className="hover:underline">{p.code}</Link>
                      <Link href={`/projetos/${p.id}/dashboard`} className="ml-2 text-xs text-primary hover:underline">📊</Link>
                    </td>
                    <td className="py-2 pr-4">{p.name}</td>
                    <td className="py-2 pr-4"><Badge variant="outline">{p.status}</Badge></td>
                    <td className="py-2 pr-4">{p.currentPhase}</td>
                     <td className="py-2 pr-4 text-right">{p.openRfis + p.openPunchItems}{p.delayed ? " ⚠" : ""}</td>
                    <td className="py-2 pr-4">{p.plannedStart ?? "—"}</td>
                    <td className="py-2 pr-4">{p.plannedEnd ?? "—"}</td>
                    <td className="py-2 pr-4 text-right">{fmt(p.bac)}</td>
                    <td className="py-2 pr-4 text-right">{fmt(p.pv)}</td>
                    <td className="py-2 pr-4 text-right">{fmt(p.ev)}</td>
                    <td className="py-2 pr-4 text-right">{fmt(p.ac)}</td>
                    <td className="py-2 pr-4 text-right">{p.plannedPct.toFixed(1)}%</td>
                    <td className="py-2 pr-4 text-right">{p.actualPct.toFixed(1)}%</td>
                    <td className={`py-2 pr-4 text-right ${colorForRatio(p.spi)}`}>{p.spi ?? "—"}</td>
                    <td className={`py-2 pr-4 text-right ${colorForRatio(p.cpi)}`}>{p.cpi ?? "—"}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={15} className="py-4 text-center text-muted-foreground">Nenhum projeto encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}