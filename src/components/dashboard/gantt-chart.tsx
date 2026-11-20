"use client";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface GanttRow {
  code: string;
  name: string;
  start: string | null;
  end: string | null;
  duration: number;
  critical: boolean;
  float: number;
  progress: number;
  status?: string;
  wbsNodeCode?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  forecastStart?: string | null;
  forecastEnd?: string | null;
}

export interface GanttDependency { from: string; to: string; type?: string; }

interface Props {
  rows: GanttRow[];
  dependencies?: GanttDependency[];
  asOf?: string;
}

const ZOOMS = [
  { key: "month", label: "Mês", pxPerDay: 4 },
  { key: "week", label: "Semana", pxPerDay: 12 },
  { key: "day", label: "Dia", pxPerDay: 24 },
] as const;

type ZoomKey = (typeof ZOOMS)[number]["key"];

const STATUS_COLOR: Record<string, string> = {
  NOT_STARTED: "bg-slate-400",
  IN_PROGRESS: "bg-blue-500",
  COMPLETED: "bg-emerald-500",
  ON_HOLD: "bg-amber-500",
  CANCELLED: "bg-gray-400",
};

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}


export function GanttChart({ rows, dependencies = [], asOf }: Props) {
  const [zoom, setZoom] = useState<ZoomKey>("week");
  const [tooltip, setTooltip] = useState<{ row: GanttRow; x: number; y: number } | null>(null);

  const pxPerDay = ZOOMS.find((z) => z.key === zoom)!.pxPerDay;

  const { minStart, maxEnd, range } = useMemo(() => {
    const starts = rows.map((r) => (r.start ? new Date(`${r.start}T00:00:00`).getTime() : Infinity));
    const ends = rows.map((r) => (r.end ? new Date(`${r.end}T00:00:00`).getTime() : -Infinity));
    const ms = Math.min(...starts.filter(Number.isFinite));
    const me = Math.max(...ends.filter(Number.isFinite));
    const today = new Date().getTime();
    const min = Number.isFinite(ms) ? ms : today;
    const max = Number.isFinite(me) ? me : today + 86400000;
    return { minStart: min, maxEnd: max, range: max - min || 86400000 };
  }, [rows]);

  const totalDays = Math.ceil(range / 86400000) + 1;
  const timelineWidth = totalDays * pxPerDay;
  const rowHeight = 46;
  const sidebarWidth = 260;

  // ticks
  const ticks = useMemo(() => {
    const out: { pos: number; label: string; major: boolean }[] = [];
    const min = new Date(minStart);
    if (zoom === "day") {
      for (let i = 0; i < totalDays; i++) {
        const d = addDays(min, i);
        out.push({ pos: i * pxPerDay, label: String(d.getDate()), major: d.getDay() === 1 });
      }
    } else if (zoom === "week") {
      for (let i = 0; i < totalDays; i += 7) {
        const d = addDays(min, i);
        out.push({ pos: i * pxPerDay, label: `${d.getDate()}/${d.getMonth() + 1}`, major: true });
      }
    } else {
      // month: first day of each month
      const cur = new Date(min.getFullYear(), min.getMonth(), 1);
      while (cur.getTime() <= maxEnd) {
        const idx = (cur.getTime() - minStart) / 86400000;
        if (idx >= 0) {
          out.push({ pos: idx * pxPerDay, label: cur.toLocaleString("pt-BR", { month: "short", year: "2-digit" }), major: true });
        }
        cur.setMonth(cur.getMonth() + 1);
        cur.setDate(1);
      }
    }
    return out;
  }, [zoom, totalDays, minStart, maxEnd, pxPerDay]);

  const todayX = (new Date().getTime() - minStart) / 86400000 * pxPerDay;
  const asOfX = asOf ? (new Date(`${asOf}T00:00:00`).getTime() - minStart) / 86400000 * pxPerDay : null;

  // map code -> row index
  const rowIndex = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r, i) => m.set(r.code, i));
    return m;
  }, [rows]);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem atividades.</p>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Gantt interativo (estilo MS Project)</CardTitle>
        <div className="flex items-center gap-1">
          {ZOOMS.map((z) => (
            <button
              key={z.key}
              type="button"
              onClick={() => setZoom(z.key)}
              className={`rounded-md border px-2 py-1 text-xs ${zoom === z.key ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {z.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-red-500" /> Crítico</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-blue-500" /> Em execução</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-emerald-500" /> Concluída</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-amber-500" /> Suspensa</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-slate-400" /> Não iniciada</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-1 bg-emerald-300" /> Realizado</span>
          <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-red-600" /> Hoje</span>
        </div>

        <div className="relative overflow-auto rounded-lg border border-border bg-surface" style={{ maxHeight: 520 }}>
          <div style={{ minWidth: sidebarWidth + timelineWidth }}>
            {/* header */}
            <div className="sticky top-0 z-20 flex border-b border-border bg-surface">
              <div className="sticky left-0 z-30 shrink-0 border-r border-border bg-surface px-2 py-1 text-xs font-medium" style={{ width: sidebarWidth }}>
                Atividade
              </div>
              <div className="relative h-8" style={{ width: timelineWidth }}>
                {ticks.map((t, i) => (
                  <div
                    key={i}
                    className={`absolute top-0 h-8 border-l border-border/40 px-1 text-[10px] text-muted-foreground ${t.major ? "font-semibold" : ""}`}
                    style={{ left: t.pos }}
                  >
                    {t.label}
                  </div>
                ))}
              </div>
            </div>

            {/* rows */}
            <div className="relative">
              {rows.map((r) => {
                const s = r.start ? new Date(`${r.start}T00:00:00`).getTime() : minStart;
                const e = r.end ? new Date(`${r.end}T00:00:00`).getTime() : s + 86400000;
                const left = ((s - minStart) / 86400000) * pxPerDay;
                const width = Math.max(pxPerDay * 0.5, ((e - s) / 86400000 + 1) * pxPerDay);
                const isMilestone = r.duration === 0;
                const baseColor = r.critical ? "bg-red-500" : (STATUS_COLOR[r.status ?? ""] ?? "bg-blue-500");
                // actual bar
                const as = r.actualStart ? new Date(`${r.actualStart}T00:00:00`).getTime() : null;
                const ae = r.actualEnd ? new Date(`${r.actualEnd}T00:00:00`).getTime() : null;
                const actualLeft = as !== null ? ((as - minStart) / 86400000) * pxPerDay : null;
                const actualWidth = as !== null && ae !== null ? Math.max(pxPerDay * 0.5, ((ae - as) / 86400000 + 1) * pxPerDay) : null;

                return (
                  <div key={r.code} className="flex border-b border-border/40" style={{ height: rowHeight }}>
                    <div
                      className="sticky left-0 z-10 shrink-0 border-r border-border bg-surface px-2 py-1"
                      style={{ width: sidebarWidth }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-xs font-medium">{r.code}</span>
                        <div className="flex items-center gap-1">
                          {r.critical && <Badge variant="destructive" className="text-[9px]">Crít.</Badge>}
                          {r.wbsNodeCode && <Badge variant="secondary" className="text-[9px]">{r.wbsNodeCode}</Badge>}
                        </div>
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">{r.name}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{r.progress}%</span>
                        {r.float > 0 && <span>float {r.float}d</span>}
                      </div>
                    </div>
                    <div className="relative" style={{ width: timelineWidth, height: rowHeight }}>
                      {/* grid lines */}
                      {ticks.map((t, i) => (
                        <div key={i} className="absolute top-0 h-full border-l border-border/20" style={{ left: t.pos }} />
                      ))}
                      {/* planned bar */}
                      {isMilestone ? (
                        <div
                          className={`absolute top-1/2 -translate-y-1/2 rotate-45 ${baseColor}`}
                          style={{ left: left - 6, width: 12, height: 12 }}
                          onMouseEnter={(e) => setTooltip({ row: r, x: e.clientX, y: e.clientY })}
                          onMouseLeave={() => setTooltip(null)}
                          title={`${r.code}: ${r.start ?? "—"} → ${r.end ?? "—"}`}
                        />
                      ) : (
                        <div
                          className={`absolute top-2 h-4 rounded ${baseColor} shadow-sm`}
                          style={{ left, width }}
                          onMouseEnter={(e) => setTooltip({ row: r, x: e.clientX, y: e.clientY })}
                          onMouseMove={(e) => setTooltip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))}
                          onMouseLeave={() => setTooltip(null)}
                        >
                          <div className="h-full rounded bg-black/25" style={{ width: `${Math.min(100, r.progress)}%` }} />
                        </div>
                      )}
                      {/* actual bar */}
                      {actualLeft !== null && actualWidth !== null && (
                        <div
                          className="absolute bottom-2 h-2 rounded bg-emerald-400/80"
                          style={{ left: actualLeft, width: actualWidth }}
                        />
                      )}
                      {/* float tail */}
                      {r.float > 0 && r.end && (
                        <div
                          className="absolute top-2 h-4 rounded-r bg-red-200/40"
                          style={{ left: left + width, width: r.float * pxPerDay }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}

              {/* today line */}
              {todayX >= 0 && todayX <= timelineWidth && (
                <div className="pointer-events-none absolute top-0 z-10 w-0.5 bg-red-600" style={{ left: sidebarWidth + todayX, height: rows.length * rowHeight }}>
                  <div className="absolute -top-1 -left-1.5 h-3 w-3 rounded-full bg-red-600" />
                </div>
              )}
              {/* asOf line */}
              {asOfX !== null && asOfX >= 0 && asOfX <= timelineWidth && (
                <div className="pointer-events-none absolute top-0 z-10 w-0.5 bg-indigo-500/70" style={{ left: sidebarWidth + asOfX, height: rows.length * rowHeight }} />
              )}

              {/* dependency arrows SVG */}
              <svg
                className="pointer-events-none absolute top-0 z-20"
                style={{ left: sidebarWidth, width: timelineWidth, height: rows.length * rowHeight }}
                viewBox={`0 0 ${timelineWidth} ${rows.length * rowHeight}`}
              >
                <defs>
                  <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                    <path d="M0,0 L8,4 L0,8 Z" fill="#64748b" />
                  </marker>
                </defs>
                {dependencies.map((dep, i) => {
                  const fromIdx = rowIndex.get(dep.from);
                  const toIdx = rowIndex.get(dep.to);
                  if (fromIdx === undefined || toIdx === undefined) return null;
                  const fromRow = rows[fromIdx];
                  const toRow = rows[toIdx];
                  if (!fromRow.end || !toRow.start) return null;
                  const fromX = ((new Date(`${fromRow.end}T00:00:00`).getTime() - minStart) / 86400000 + 1) * pxPerDay;
                  const fromY = fromIdx * rowHeight + rowHeight / 2;
                  const toX = ((new Date(`${toRow.start}T00:00:00`).getTime() - minStart) / 86400000) * pxPerDay;
                  const toY = toIdx * rowHeight + rowHeight / 2;
                  const midX = fromX + 8;
                  const path = `M ${fromX} ${fromY} H ${midX} V ${toY} H ${toX}`;
                  return <path key={i} d={path} stroke="#64748b" strokeWidth={1.2} fill="none" markerEnd="url(#arrow)" opacity={0.7} />;
                })}
              </svg>
            </div>
          </div>
        </div>

        {tooltip && (
          <div
            className="pointer-events-none fixed z-50 max-w-xs rounded-md border border-border bg-background px-3 py-2 text-xs shadow-lg"
            style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
          >
            <div className="font-semibold">{tooltip.row.code} — {tooltip.row.name}</div>
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground">
              <span>Início plan.</span><span className="text-foreground">{tooltip.row.start ?? "—"}</span>
              <span>Fim plan.</span><span className="text-foreground">{tooltip.row.end ?? "—"}</span>
              <span>Início real</span><span className="text-foreground">{tooltip.row.actualStart ?? "—"}</span>
              <span>Fim real</span><span className="text-foreground">{tooltip.row.actualEnd ?? "—"}</span>
              <span>Previsão</span><span className="text-foreground">{tooltip.row.forecastStart ?? "—"} → {tooltip.row.forecastEnd ?? "—"}</span>
              <span>Duração</span><span className="text-foreground">{tooltip.row.duration} d</span>
              <span>Avanço</span><span className="text-foreground">{tooltip.row.progress}%</span>
              <span>Float</span><span className="text-foreground">{tooltip.row.float} d</span>
              <span>Status</span><span className="text-foreground">{tooltip.row.status ?? "—"}</span>
              {tooltip.row.wbsNodeCode && (<><span>WBS</span><span className="text-foreground">{tooltip.row.wbsNodeCode}</span></>)}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}