// Fila de jobs das integrações (job_queue, ADR-015). Desacopla o núcleo dos
// provedores: operações críticas apenas enfileiram; um cron processa depois
// com timeout, circuit breaker e retry/backoff. Nenhum caminho desta camada
// lança erro para o chamador — falha de integração nunca derruba o núcleo.

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/modules/integrations/email";
import { sendWhatsAppTemplate } from "@/modules/integrations/whatsapp";
import { notifyEventMembers } from "@/modules/integrations/notifications";
import {
  circuitCooldownMs,
  disabledRetryMs,
  safeCall,
  type SafeCallResult,
} from "@/modules/integrations/isolation";

export type JobOutcome =
  | { status: "success"; detail?: string }
  | { status: "failed"; error: string }
  | { status: "skipped"; reason: "disabled" | "circuit_open" };

export type JobHandler = (payload: Record<string, unknown>) => Promise<JobOutcome>;

const handlers = new Map<string, JobHandler>();

export function registerJobHandler(type: string, handler: JobHandler): void {
  handlers.set(type, handler);
}

const WORKER_ID = `cron:${process.pid}:${Date.now().toString(36)}`.slice(0, 64);

export interface EnqueueJobInput {
  type: string;
  payload?: Record<string, unknown>;
  /** Idempotência: mesma chave = mesmo job (P2002 é ignorado). */
  dedupeKey?: string;
  maxAttempts?: number;
  runAt?: Date;
}

/**
 * Insere um job de forma idempotente. Nunca lança: se a gravação falhar,
 * loga e devolve null (o chamador decide o que fazer — o padrão é não
 * bloquear a operação de negócio).
 */
export async function enqueueJob(input: EnqueueJobInput): Promise<string | null> {
  try {
    const job = await prisma.jobQueue.create({
      data: {
        type: input.type,
        payload: (input.payload ?? {}) as object,
        dedupeKey: input.dedupeKey ?? null,
        maxAttempts: input.maxAttempts ?? 5,
        runAt: input.runAt ?? new Date(),
      },
      select: { id: true },
    });
    return job.id;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002") {
      logger.info("integration_job_deduped", { type: input.type, dedupeKey: input.dedupeKey });
      return null;
    }
    logger.error("integration_job_enqueue_failed", {
      type: input.type,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

interface ClaimableJob {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
}

/** Reivindicação atômica: só um worker leva o job (evita processamento duplo). */
async function claimJob(id: string): Promise<boolean> {
  const res = await prisma.jobQueue.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "RUNNING", lockedAt: new Date(), lockedBy: WORKER_ID },
  });
  return res.count === 1;
}

function backoffMs(attempts: number): number {
  return Math.min(30_000 * 2 ** attempts, 30 * 60_000);
}

function payloadOf(job: ClaimableJob): Record<string, unknown> {
  const payload = job.payload;
  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return {};
}

/**
 * Semântica de resultado:
 * - success  → job SUCCESS;
 * - skipped  → NÃO conta tentativa: mantém PENDING e adia (circuito: cooldown;
 *              provedor desligado: janela maior) — ao reativar, roda normalmente;
 * - failed   → conta tentativa com backoff; estourou maxAttempts → FAILED.
 */
async function executeJob(job: ClaimableJob): Promise<"SUCCESS" | "RETRY" | "FAILED" | "DELAYED"> {
  const handler = handlers.get(job.type);
  if (!handler) {
    await prisma.jobQueue.update({
      where: { id: job.id },
      data: { status: "FAILED", lastError: `handler não registrado para "${job.type}"` },
    });
    return "FAILED";
  }

  let outcome: JobOutcome;
  try {
    outcome = await handler(payloadOf(job));
  } catch (error) {
    outcome = { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }

  const now = new Date();

  if (outcome.status === "success") {
    await prisma.jobQueue.update({
      where: { id: job.id },
      data: { status: "SUCCESS", lockedAt: null, lockedBy: null, lastError: null },
    });
    return "SUCCESS";
  }

  if (outcome.status === "skipped") {
    const delay = outcome.reason === "circuit_open" ? circuitCooldownMs() : disabledRetryMs();
    await prisma.jobQueue.update({
      where: { id: job.id },
      data: {
        status: "PENDING",
        lockedAt: null,
        lockedBy: null,
        runAt: new Date(now.getTime() + delay),
        lastError: `skipped: ${outcome.reason}`,
      },
    });
    return "DELAYED";
  }

  const attempts = job.attempts + 1;
  const exhausted = attempts >= job.maxAttempts;
  await prisma.jobQueue.update({
    where: { id: job.id },
    data: exhausted
      ? {
          status: "FAILED",
          attempts,
          lockedAt: null,
          lockedBy: null,
          lastError: outcome.error.slice(0, 500),
        }
      : {
          status: "PENDING",
          attempts,
          lockedAt: null,
          lockedBy: null,
          runAt: new Date(now.getTime() + backoffMs(attempts)),
          lastError: outcome.error.slice(0, 500),
        },
  });
  logger.warn(exhausted ? "integration_job_failed" : "integration_job_retry", {
    jobId: job.id,
    type: job.type,
    attempts,
    error: outcome.error,
  });
  return exhausted ? "FAILED" : "RETRY";
}

export interface ProcessJobsOptions {
  types?: string[];
  limit?: number;
}

export interface ProcessJobsResult {
  claimed: number;
  succeeded: number;
  retried: number;
  failed: number;
  delayed: number;
}

/**
 * Processa os jobs vencidos. Seguro de chamar em paralelo (reivindicação
 * atômica) e nunca lança: erro interno é logado e o resultado parcial é
 * devolvido. Antes, devolve à fila jobs RUNNING órfãos (worker caiu).
 */
export async function processJobs(options: ProcessJobsOptions = {}): Promise<ProcessJobsResult> {
  const limit = options.limit ?? 25;
  const result: ProcessJobsResult = { claimed: 0, succeeded: 0, retried: 0, failed: 0, delayed: 0 };
  try {
    await prisma.jobQueue.updateMany({
      where: { status: "RUNNING", lockedAt: { lt: new Date(Date.now() - 5 * 60_000) } },
      data: { status: "PENDING", lockedAt: null, lockedBy: null },
    });

    const jobs = await prisma.jobQueue.findMany({
      where: {
        status: "PENDING",
        runAt: { lte: new Date() },
        ...(options.types ? { type: { in: options.types } } : {}),
      },
      orderBy: { runAt: "asc" },
      take: limit,
      select: { id: true, type: true, payload: true, attempts: true, maxAttempts: true },
    });

    for (const job of jobs) {
      try {
        if (!(await claimJob(job.id))) continue; // outro worker levou
        result.claimed += 1;
        const status = await executeJob(job);
        if (status === "SUCCESS") result.succeeded += 1;
        else if (status === "RETRY") result.retried += 1;
        else if (status === "FAILED") result.failed += 1;
        else result.delayed += 1;
      } catch (error) {
        logger.error("integration_job_execute_failed", {
          jobId: job.id,
          type: job.type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    logger.error("integration_jobs_process_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return result;
}

/**
 * Executa um job imediatamente (caminho inline best-effort). Nunca lança:
 * se qualquer etapa falhar, o job permanece PENDING e o cron retoma.
 * Retorna o status final ou null se o job não era mais reivindicável.
 */
export async function runJobNow(jobId: string): Promise<string | null> {
  try {
    const job = await prisma.jobQueue.findUnique({
      where: { id: jobId },
      select: { id: true, type: true, payload: true, attempts: true, maxAttempts: true, status: true },
    });
    if (!job || job.status !== "PENDING") return null;
    if (!(await claimJob(jobId))) return null;
    return await executeJob(job);
  } catch (error) {
    logger.error("integration_job_inline_failed", {
      jobId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function toOutcome(result: SafeCallResult<{ ok: boolean; error?: string }>): JobOutcome {
  if (result.status === "ok") return { status: "success" };
  if (result.status === "skipped") return { status: "skipped", reason: result.reason };
  return { status: "failed", error: result.error };
}

// ---------------------------------------------------------------------------
// Handlers registrados por tipo de job
// ---------------------------------------------------------------------------

registerJobHandler("email.send", async (payload) => {
  const result = await safeCall(
    "email",
    "email",
    (signal) =>
      sendEmail({
        to: String(payload.to ?? ""),
        subject: String(payload.subject ?? ""),
        html: String(payload.html ?? ""),
        text: payload.text !== undefined ? String(payload.text) : undefined,
        signal,
      }),
    { isFailure: (value) => !value.ok }
  );
  return toOutcome(result);
});

registerJobHandler("whatsapp.send", async (payload) => {
  const result = await safeCall(
    "whatsapp",
    "whatsapp",
    (signal) =>
      sendWhatsAppTemplate({
        to: String(payload.to ?? ""),
        templateName: String(payload.templateName ?? ""),
        params: Array.isArray(payload.params) ? payload.params.map(String) : undefined,
        languageCode: payload.languageCode !== undefined ? String(payload.languageCode) : undefined,
        signal,
      }),
    { isFailure: (value) => !value.ok }
  );
  return toOutcome(result);
});

registerJobHandler("whatsapp.notify", async (payload) => {
  const eventId = typeof payload.eventId === "string" ? payload.eventId : null;
  if (!eventId) return { status: "failed", error: "payload.eventId ausente" };
  const summary = await notifyEventMembers(eventId);
  if (summary.disabled) return { status: "skipped", reason: "disabled" };
  if (summary.sent > 0 || summary.recipients === 0) {
    return { status: "success", detail: `enviados ${summary.sent}/${summary.recipients}` };
  }
  if (summary.circuitOpen) return { status: "skipped", reason: "circuit_open" };
  return { status: "failed", error: summary.lastError ?? "nenhuma mensagem enviada" };
});
