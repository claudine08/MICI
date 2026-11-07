import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { dispatchPendingEvents } from "@/modules/integrations/webhooks";
import { processJobs } from "@/modules/integrations/jobs";

// Cron das integrações: consumidor único do outbox domain_events (fan-out
// webhook + jobs de notificação) e, junto, processa a fila de jobs — a
// reivindicação atômica dos jobs torna seguro rodar nos dois crons.
// O Vercel Cron envia GET com `Authorization: Bearer $CRON_SECRET`; POST
// continua aceito para disparo manual (runbook).
async function runCron(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    throw new AppError("FORBIDDEN", "Cron não autorizado.");
  }
  const events = await dispatchPendingEvents();
  const jobs = await processJobs({ limit: 25 });
  return Response.json({ ok: true, ...events, jobs });
}

export const { GET, POST } = apiHandler({
  GET: runCron,
  POST: runCron,
});
