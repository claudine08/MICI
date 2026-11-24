"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

interface ProjectRow {
  id: string;
  code: string;
  name: string;
  status: string;
  phase: string;
  health: "GREEN" | "AMBER" | "RED";
  metrics: any;
}

export function PmoView() {
  const [data, setData] = useState<{ projects: ProjectRow[]; totals: any } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/pmo/overview")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error.message ?? "Erro");
        else setData(d);
      })
      .catch(() => setError("Falha ao carregar."));
  }, []);

  if (error) return <p className="text-destructive">{error}</p>;
  if (!data) return <p>Carregando...</p>;

  const healthColor = (h: string) =>
    h === "GREEN" ? "text-success" : h === "AMBER" ? "text-warning" : "text-destructive";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {Object.entries(data.totals).map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border bg-surface p-3">
            <div className="text-xs uppercase text-muted-foreground">{k}</div>
            <div className="text-lg font-semibold">{String(v)}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="mb-2 text-sm font-semibold">Métricas por projeto</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.projects.map((p) => ({ name: p.code, tarefas: p.metrics.tasks, riscos: p.metrics.risks, ncs: p.metrics.quality.nonConformities, punch: p.metrics.quality.punchItems }))}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="tarefas" fill="#3b82f6" />
              <Bar dataKey="riscos" fill="#f59e0b" />
              <Bar dataKey="ncs" fill="#ef4444" />
              <Bar dataKey="punch" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="mb-2 text-sm font-semibold">Saúde do portfólio</div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={[
                  { name: "Verde", value: data.projects.filter((p) => p.health === "GREEN").length },
                  { name: "Âmbar", value: data.projects.filter((p) => p.health === "AMBER").length },
                  { name: "Vermelho", value: data.projects.filter((p) => p.health === "RED").length },
                ]}
                dataKey="value"
                nameKey="name"
                outerRadius={90}
                label
              >
                <Cell fill="#22c55e" />
                <Cell fill="#f59e0b" />
                <Cell fill="#ef4444" />
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="px-3 py-2">Projeto</th>
              <th className="px-3 py-2">Fase</th>
              <th className="px-3 py-2">Saúde</th>
              <th className="px-3 py-2">Tarefas</th>
              <th className="px-3 py-2">Restrições</th>
              <th className="px-3 py-2">Riscos</th>
              <th className="px-3 py-2">Mudanças</th>
              <th className="px-3 py-2">NCs</th>
              <th className="px-3 py-2">Punch</th>
              <th className="px-3 py-2">Req.</th>
              <th className="px-3 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {data.projects.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium">{p.code} — {p.name}</td>
                <td className="px-3 py-2">{p.phase}</td>
                <td className={`px-3 py-2 font-semibold ${healthColor(p.health)}`}>{p.health}</td>
                <td className="px-3 py-2">{p.metrics.tasks}</td>
                <td className="px-3 py-2">{p.metrics.constraints}</td>
                <td className="px-3 py-2">{p.metrics.risks}</td>
                <td className="px-3 py-2">{p.metrics.changes}</td>
                <td className="px-3 py-2">{p.metrics.quality.nonConformities}</td>
                <td className="px-3 py-2">{p.metrics.quality.punchItems}</td>
                <td className="px-3 py-2">{p.metrics.requirements}</td>
                <td className="px-3 py-2">
                  <a className="text-primary underline" href={`/projetos/${p.id}`}>Abrir</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}