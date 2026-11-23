"use client";

import { useEffect, useState } from "react";

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