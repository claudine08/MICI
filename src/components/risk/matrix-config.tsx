"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings2 } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import type { RiskMatrixView } from "@/components/risk/risk-view";

// Configuração da matriz de risco da organização (E10-US02, §32): rótulos
// 1–5 por eixo e limites de nível sobre a exposição (1–25). PUT exige
// RISK:ADMIN; os níveis de todos os riscos passam a usar a nova matriz.

interface Props {
  matrix: RiskMatrixView;
  canAdmin: boolean;
}

export function MatrixConfig({ matrix, canAdmin }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [probabilityLabels, setProbabilityLabels] = useState(
    matrix.probabilityLabels.join("\n")
  );
  const [impactLabels, setImpactLabels] = useState(matrix.impactLabels.join("\n"));
  const [lowMax, setLowMax] = useState(String(matrix.lowMax));
  const [mediumMax, setMediumMax] = useState(String(matrix.mediumMax));
  const [highMax, setHighMax] = useState(String(matrix.highMax));

  if (!canAdmin) return null;

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await apiRequest("/api/v1/risk-matrix", {
        method: "PUT",
        body: JSON.stringify({
          probabilityLabels: probabilityLabels.split("\n").map((line) => line.trim()),
          impactLabels: impactLabels.split("\n").map((line) => line.trim()),
          lowMax: Number(lowMax),
          mediumMax: Number(mediumMax),
          highMax: Number(highMax),
        }),
      });
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar a matriz.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Settings2 className="h-4 w-4" />
        Configurar matriz
      </Button>
      <Dialog open={open} title="Matriz de risco (5×5)" onClose={() => setOpen(false)} wide>
        <div className="flex flex-col gap-4">
          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="matrix-probability">
                Rótulos de probabilidade (1 por linha, do 1 ao 5)
              </Label>
              <textarea
                id="matrix-probability"
                value={probabilityLabels}
                onChange={(event) => setProbabilityLabels(event.target.value)}
                rows={5}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="matrix-impact">
                Rótulos de impacto (1 por linha, do 1 ao 5)
              </Label>
              <textarea
                id="matrix-impact"
                value={impactLabels}
                onChange={(event) => setImpactLabels(event.target.value)}
                rows={5}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="matrix-low">Máximo do nível Baixo</Label>
              <input
                id="matrix-low"
                type="number"
                min={1}
                max={24}
                value={lowMax}
                onChange={(event) => setLowMax(event.target.value)}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="matrix-medium">Máximo do nível Médio</Label>
              <input
                id="matrix-medium"
                type="number"
                min={2}
                max={24}
                value={mediumMax}
                onChange={(event) => setMediumMax(event.target.value)}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="matrix-high">Máximo do nível Alto</Label>
              <input
                id="matrix-high"
                type="number"
                min={3}
                max={25}
                value={highMax}
                onChange={(event) => setHighMax(event.target.value)}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Exposição (probabilidade × impacto) de 1 a 25: ≤ Baixo ≤ Médio ≤ Alto ≤ Crítico.
            Ex.: 4/9/16 (padrão).
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void submit()} disabled={busy}>
              {busy ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
