import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";

// Backup diário: cria uma branch de backup no Neon. O Vercel Cron envia GET
// com `Authorization: Bearer $CRON_SECRET`; POST continua aceito para
// disparo manual (runbook).
async function runCron(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    throw new AppError("FORBIDDEN", "Cron não autorizado.");
  }

  const neonApiKey = process.env.NEON_API_KEY;
  const neonProjectId = process.env.NEON_PROJECT_ID;
  if (!neonApiKey || !neonProjectId) {
    console.log("[backup:dev] NEON_API_KEY/NEON_PROJECT_ID ausentes; backup ignorado.");
    return Response.json({ ok: true, provider: "none", message: "Config ausente; nada feito." });
  }

  const branchName = `backup-${new Date().toISOString().slice(0, 10)}`;
  const res = await fetch(`https://console.neon.tech/api/v2/projects/${neonProjectId}/branches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${neonApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ branch: { name: branchName } }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new AppError("INTERNAL", `Falha ao criar branch de backup: ${res.status} ${body}`);
  }
  const data = await res.json();
  return Response.json({ ok: true, provider: "neon", branch: data?.branch?.name ?? branchName });
}

export const { GET, POST } = apiHandler({
  GET: runCron,
  POST: runCron,
});
