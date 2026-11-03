"use client";
import { useState, useTransition } from "react";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

interface PromptLite { code: string; name: string; description: string; template: string; model: string; }
interface RequestRow { id: string; promptCode: string; input: string; output: string | null; model: string; status: string; errorMessage: string | null; tokensIn: number | null; tokensOut: number | null; createdAt: string; }

interface Props { prompts: PromptLite[]; initialRequests: RequestRow[]; canCreate: boolean; }

export function AiView({ prompts, initialRequests, canCreate }: Props) {
  const [selected, setSelected] = useState(prompts[0]?.code ?? "");
  const [input, setInput] = useState("");
  const [projectId, setProjectId] = useState("");
  const [mode, setMode] = useState<"mock" | "demo" | "ollama" | "opencode" | "openai">("mock");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [requests, setRequests] = useState(initialRequests);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const run = async () => {
    setError(""); setOutput("");
    try {
      const res = await apiRequest<{ output: string; status: string; errorMessage?: string }>("/api/v1/ai/run", {
        method: "POST",
        body: JSON.stringify({ promptCode: selected, input, projectId: projectId || undefined, mode }),
      });
      setOutput(res.output);
      if (res.status === "FAILED") setError(res.errorMessage ?? "Falha");
      startTransition(() => { window.location.reload(); });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Executar prompt</h2>
        <div className="space-y-3">
          <div>
            <Label>Prompt</Label>
            <select className="w-full rounded border p-2" value={selected} onChange={(e) => setSelected(e.target.value)}>
              {prompts.map((p) => <option key={p.code} value={p.code}>{p.name} ({p.code})</option>)}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">{prompts.find((p) => p.code === selected)?.description}</p>
          </div>
          <div>
            <Label>Modo</Label>
            <select className="w-full rounded border p-2" value={mode} onChange={(e) => setMode(e.target.value as "mock" | "demo" | "ollama" | "opencode" | "openai")}>
              <option value="mock">Mock (sem custo)</option>
              <option value="demo">Demo (resposta elaborada simulada)</option>
              <option value="ollama">Ollama (modelo local free)</option>
              <option value="opencode">OpenCode AI (modelo free)</option>
              <option value="openai">OpenAI</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">Mock não consome créditos. OpenCode requer OPENCODE_API_KEY no servidor.</p>
          </div>
          <div>
            <Label>Project ID (opcional)</Label>
            <Input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="uuid do projeto" />
          </div>
          <div>
            <Label>Input</Label>
            <textarea className="w-full rounded border p-2" rows={6} value={input} onChange={(e) => setInput(e.target.value)} />
          </div>
          {canCreate && (
            <Button onClick={run} disabled={isPending || !input.trim()}>Executar</Button>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {output && (
            <div className="rounded border bg-muted p-3 text-sm whitespace-pre-wrap">{output}</div>
          )}
        </div>
      </Card>
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Histórico de requisições</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 pr-3">Data</th><th className="py-2 pr-3">Prompt</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Modelo</th><th className="py-2 pr-3">Tokens</th><th className="py-2 pr-3"></th></tr></thead>
            <tbody>
              {requests.map((r) => (
                <>
                  <tr key={r.id} className="border-b cursor-pointer hover:bg-muted/50" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                    <td className="py-2 pr-3 text-xs">{r.createdAt.slice(0, 19).replace("T", " ")}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{r.promptCode}</td>
                    <td className="py-2 pr-3"><span className={r.status === "SUCCESS" ? "text-emerald-600" : "text-red-600"}>{r.status}</span></td>
                    <td className="py-2 pr-3 text-xs">{r.model}</td>
                    <td className="py-2 pr-3 text-xs">{r.tokensIn ?? "—"} / {r.tokensOut ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{expandedId === r.id ? "▲" : "▼"}</td>
                  </tr>
                  {expandedId === r.id && (
                    <tr key={r.id + "-detail"} className="border-b bg-muted/30">
                      <td colSpan={6} className="p-3 text-xs">
                        <div className="mb-2"><strong>Input:</strong><div className="whitespace-pre-wrap rounded border bg-background p-2 mt-1">{r.input}</div></div>
                        <div><strong>Output:</strong><div className="whitespace-pre-wrap rounded border bg-background p-2 mt-1">{r.output ?? "—"}</div></div>
                        {r.errorMessage && <div className="mt-2 text-red-600"><strong>Erro:</strong> {r.errorMessage}</div>}
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {requests.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">Nenhuma requisição.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}