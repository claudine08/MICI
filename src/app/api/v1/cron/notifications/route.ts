import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { processJobs } from "@/modules/integrations/jobs";

// Worker de notificações: processa a fila de jobs das integrações
// (e-mails de aprovação, WhatsApp). NÃO consome domain_events — o outbox é
// consumido apenas por /cron/webhooks (consumidor único, sem corrida).
// A reivindicação atômica dos jobs torna seguro processar a fila em
// qualquer um dos crons. O Vercel Cron envia GET com `Bearer $CRON_SECRET`;
// POST continua aceito para disparo manual (runbook).
async function runCron(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    throw new AppError("FORBIDDEN", "Cron não autorizado.");
  }
  const result = await processJobs({ limit: 25 });
  return Response.json({ ok: true, ...result });
}

export const { GET, POST } = apiHandler({
  GET: runCron,
  POST: runCron,
});
