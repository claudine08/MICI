"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
// textarea nativo (shadcn textarea não existe neste repo)
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Approval = {
  id: string;
  objectType: string;
  objectId: string;
  approverEmail: string;
  status: string;
  decisionComment: string | null;
  decidedAt: string | null;
  expiresAt: string;
};

export function ApprovalView({ approval, token }: { approval: Approval; token: string }) {
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState(approval.status);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "APPROVED" | "REJECTED") {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/approvals/${token}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, comment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Falha ao decidir.");
      setStatus(data.approval.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Aprovação de {approval.objectType}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Objeto: <span className="font-mono">{approval.objectId}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Aprovador: {approval.approverEmail}
          </p>
          <p className="text-sm">
            Status atual: <strong>{status}</strong>
          </p>
          {status === "PENDING" ? (
            <>
              <textarea
                className="w-full rounded-md border p-2 text-sm"
                placeholder="Comentário (opcional)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <div className="flex gap-2">
                <Button onClick={() => decide("APPROVED")} disabled={loading}>
                  Aprovar
                </Button>
                <Button variant="destructive" onClick={() => decide("REJECTED")} disabled={loading}>
                  Rejeitar
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Decisão registrada em {approval.decidedAt ? new Date(approval.decidedAt).toLocaleString() : "-"}.
              {approval.decisionComment ? ` Comentário: ${approval.decisionComment}` : ""}
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}