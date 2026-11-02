"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export interface CurvePoint {
  month: string;
  pv: number;
  ev: number;
  ac: number;
}

export interface BurndownPoint {
  month: string;
  remaining: number;
  total: number;
}

export interface RiskCell {
  probability: number;
  impact: number;
  count: number;
}

export function CurveSChart({ data }: { data: CurvePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="pv" name="PV (planejado)" stroke="#2563eb" dot={false} />
        <Line type="monotone" dataKey="ev" name="EV (realizado físico)" stroke="#16a34a" dot={false} />
        <Line type="monotone" dataKey="ac" name="AC (custo real)" stroke="#dc2626" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BurndownChart({ data }: { data: BurndownPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="remaining" name="Atividades restantes" stroke="#7c3aed" />
        <Line type="monotone" dataKey="total" name="Total" stroke="#9ca3af" strokeDasharray="4 4" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function RiskHeatmap({ cells }: { cells: RiskCell[] }) {
  const max = Math.max(1, ...cells.map((c) => c.count));
  return (
    <div className="grid grid-cols-6 gap-1 text-xs">
      <div />
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="text-center font-medium">I{i}</div>
      ))}
      {[5, 4, 3, 2, 1].map((p) => (
        <div key={p} className="contents">
          <div className="flex items-center justify-end pr-1 font-medium">P{p}</div>
          {[1, 2, 3, 4, 5].map((i) => {
            const cell = cells.find((c) => c.probability === p && c.impact === i);
            const count = cell?.count ?? 0;
            const intensity = count === 0 ? 0 : Math.min(1, count / max);
            const bg = count === 0
              ? "bg-muted"
              : intensity < 0.34
              ? "bg-amber-200"
              : intensity < 0.67
              ? "bg-orange-300"
              : "bg-red-400";
            return (
              <div
                key={i}
                className={`flex h-8 w-8 items-center justify-center rounded ${bg} border`}
                title={`P${p} × I${i}: ${count}`}
              >
                {count || ""}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}