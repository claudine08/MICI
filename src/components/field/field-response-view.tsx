"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FieldResponseView({ token }: { token: string }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const [diaryForm, setDiaryForm] = useState({ team: "", workHours: "", activities: "", occurrences: "" });
  const [taskForm, setTaskForm] = useState({ title: "", description: "", priority: "MEDIUM" });

  useEffect(() => {
    fetch(`/api/v1/field-responses/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error.message ?? "Erro");
        else {
          setData(d);
          if (d.type === "diary") {
            setDiaryForm({
              team: d.entity.team ?? "",
              workHours: d.entity.workHours?.toString() ?? "",
              activities: d.entity.activities ?? "",
              occurrences: d.entity.occurrences ?? "",
            });
          } else if (d.type === "task") {
            setTaskForm({
              title: d.entity.title ?? "",
              description: d.entity.description ?? "",
              priority: d.entity.priority ?? "MEDIUM",
            });
          }
        }
      })
      .catch(() => setError("Falha ao carregar."));
  }, [token]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = data.type === "diary"
        ? {
            team: diaryForm.team || undefined,
            workHours: diaryForm.workHours ? Number(diaryForm.workHours) : undefined,
            activities: diaryForm.activities || undefined,
            occurrences: diaryForm.occurrences || undefined,
          }
        : {
            title: taskForm.title || undefined,
            description: taskForm.description || undefined,
            priority: taskForm.priority || undefined,
          };
      const res = await fetch(`/api/v1/field-responses/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Falha ao enviar.");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao enviar.");
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="p-6 text-destructive">{error}</p>;
  if (!data) return <p className="p-6">Carregando…</p>;
  if (done) return <p className="p-6 text-success">Resposta enviada com sucesso.</p>;

  return (
    <div className="mx-auto max-w-lg p-6 flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Resposta de Campo</h1>
      {data.type === "diary" ? (
        <>
          <div className="grid gap-1.5">
            <Label>Equipe</Label>
            <Input value={diaryForm.team} onChange={(e) => setDiaryForm({ ...diaryForm, team: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Horas trabalhadas</Label>
            <Input type="number" value={diaryForm.workHours} onChange={(e) => setDiaryForm({ ...diaryForm, workHours: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Atividades</Label>
            <Input value={diaryForm.activities} onChange={(e) => setDiaryForm({ ...diaryForm, activities: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Ocorrências</Label>
            <Input value={diaryForm.occurrences} onChange={(e) => setDiaryForm({ ...diaryForm, occurrences: e.target.value })} />
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-1.5">
            <Label>Título</Label>
            <Input value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Descrição</Label>
            <Input value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Prioridade</Label>
            <select className="rounded border p-2" value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}>
              <option value="LOW">Baixa</option>
              <option value="MEDIUM">Média</option>
              <option value="HIGH">Alta</option>
              <option value="CRITICAL">Crítica</option>
            </select>
          </div>
        </>
      )}
      <Button onClick={submit} disabled={busy}>{busy ? "Enviando…" : "Enviar resposta"}</Button>
    </div>
  );
}