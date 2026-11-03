"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface GanttRow { code: string; name: string; start: string | null; end: string | null; duration: number; critical: boolean; float: number; progress: number; }

interface Props { rows: GanttRow[]; }

export function GanttChart({ rows }: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem atividades.</p>;
  }

  const starts = rows.map((r) => (r.start ? new Date(r.start).getTime() : Infinity));
  const ends = rows.map((r) => (r.end ? new Date(r.end).getTime() : -Infinity));
  const minStart = Math.min(...starts.filter(Number.isFinite));
  const maxEnd = Math.max(...ends.filter(Number.isFinite));
  const range = maxEnd - minStart || 1;

  const fmtDate = (d: string | null) => (d ? d.slice(0, 10) : "—");

  return (
    <Card>
      <CardHeader><CardTitle>Gantt (estilo MS Project)</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            {/* header de datas */}
            <div className="flex border-b text-xs text-muted-foreground">
              <div className="w-48 shrink-0 px-2 py-1 font-medium">Atividade</div>
              <div className="flex-1 relative h-6">
                <span className="absolute left-0">{new Date(minStart).toISOString().slice(0, 10)}</span>
                <span className="absolute right-0">{new Date(maxEnd).toISOString().slice(0, 10)}</span>
              </div>
            </div>
            {rows.map((r) => {
              const s = r.start ? new Date(r.start).getTime() : minStart;
              const e = r.end ? new Date(r.end).getTime() : s + 86400000;
              const left = ((s - minStart) / range) * 100;
              const width = Math.max(1, ((e - s) / range) * 100);
              return (
                <div key={r.code} className="flex items-center border-b py-1">
                  <div className="w-48 shrink-0 px-2 text-xs">
                    <div className="font-medium truncate">{r.code}</div>
                    <div className="truncate text-muted-foreground">{r.name}</div>
                  </div>
                  <div className="flex-1 relative h-6 bg-muted/30">
                    <div
                      className={`absolute top-1 h-4 rounded ${r.critical ? "bg-red-500" : "bg-blue-500"}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`${r.code}: ${fmtDate(r.start)} → ${fmtDate(r.end)} (${r.duration}d, ${r.progress}%)`}
                    >
                      <div
                        className="h-full bg-black/20"
                        style={{ width: `${Math.min(100, r.progress)}%` }}
                      />
                    </div>
                  </div>
                  <div className="w-24 shrink-0 px-2 text-xs text-right">
                    {r.progress}% {r.critical && <Badge variant="destructive" className="ml-1 text-[10px]">Crít.</Badge>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}