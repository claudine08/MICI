// Isolamento de falhas das integrações (bulkhead + circuit breaker).
// Princípio: a queda de um provedor (Resend, Meta, endpoint de cliente) nunca
// propaga erro nem latência ilimitada para o núcleo do MICI.
//
// - Kill switch por provedor via env (default: habilitado).
// - Circuit breaker em memória por chave (por instância serverless).
// - safeCall: nunca lança; aplica timeout, registra sucesso/falha no circuito
//   e devolve um resultado discriminado que o chamador decide ignorar/retry.

import { logger } from "@/lib/logger";

export type IntegrationProvider = "email" | "whatsapp" | "webhook";

export type CircuitState = "closed" | "open" | "half_open";

export type SafeCallResult<T> =
  | { status: "ok"; value: T }
  | { status: "failed"; error: string }
  | { status: "skipped"; reason: "disabled" | "circuit_open" };

export interface SafeCallOptions<T> {
  timeoutMs?: number;
  /** Decide se o valor retornado pelo provedor representa falha (ex.: { ok: false }). */
  isFailure?: (value: T) => boolean;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_THRESHOLD = 5;
const DEFAULT_COOLDOWN_MS = 60_000;
const DEFAULT_DISABLED_RETRY_MS = 60 * 60_000;

interface Circuit {
  failures: number;
  state: "closed" | "open";
  openedAt: number;
}

const circuits = new Map<string, Circuit>();

function envFlag(name: string): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return true;
  return !["0", "false", "off", "no"].includes(raw.trim().toLowerCase());
}

function envNumber(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const PROVIDER_FLAG: Record<IntegrationProvider, string> = {
  email: "EMAIL_ENABLED",
  whatsapp: "WHATSAPP_ENABLED",
  webhook: "WEBHOOKS_ENABLED",
};

/** Kill switch: INTEGRATIONS_ENABLED (global) + flag por provedor. */
export function isProviderEnabled(provider: IntegrationProvider): boolean {
  if (!envFlag("INTEGRATIONS_ENABLED")) return false;
  return envFlag(PROVIDER_FLAG[provider]);
}

function threshold(): number {
  return envNumber("INTEGRATION_CIRCUIT_THRESHOLD", DEFAULT_THRESHOLD);
}

export function circuitCooldownMs(): number {
  return envNumber("INTEGRATION_CIRCUIT_COOLDOWN_MS", DEFAULT_COOLDOWN_MS);
}

/** Janela de reagendamento para jobs pulados porque o provedor está desligado. */
export function disabledRetryMs(): number {
  return envNumber("INTEGRATION_DISABLED_RETRY_MS", DEFAULT_DISABLED_RETRY_MS);
}

function defaultTimeoutMs(): number {
  return envNumber("INTEGRATION_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
}

export function circuitState(key: string): CircuitState {
  const circuit = circuits.get(key);
  if (!circuit || circuit.state === "closed") return "closed";
  if (Date.now() - circuit.openedAt >= circuitCooldownMs()) return "half_open";
  return "open";
}

export function recordSuccess(key: string): void {
  circuits.delete(key);
}

export function recordFailure(key: string): void {
  const circuit = circuits.get(key) ?? { failures: 0, state: "closed" as const, openedAt: 0 };
  circuit.failures += 1;
  if (circuit.state === "open") {
    // Sonda half-open falhou: mantém aberto reiniciando a janela de cooldown.
    circuit.openedAt = Date.now();
    circuits.set(key, circuit);
    return;
  }
  if (circuit.failures >= threshold()) {
    circuit.state = "open";
    circuit.openedAt = Date.now();
    logger.warn("integration_circuit_open", { key, failures: circuit.failures });
  }
  circuits.set(key, circuit);
}

/** Restaura todos os circuitos (testes). */
export function resetIsolation(): void {
  circuits.clear();
}

/**
 * Executa uma chamada de provedor com kill switch, circuit breaker e timeout.
 * Nunca lança: qualquer exceção/timeout vira `{ status: "failed" }`.
 */
export async function safeCall<T>(
  provider: IntegrationProvider,
  key: string,
  fn: (signal: AbortSignal) => Promise<T>,
  options: SafeCallOptions<T> = {}
): Promise<SafeCallResult<T>> {
  if (!isProviderEnabled(provider)) {
    return { status: "skipped", reason: "disabled" };
  }
  if (circuitState(key) === "open") {
    return { status: "skipped", reason: "circuit_open" };
  }

  const timeoutMs = Math.max(1, options.timeoutMs ?? defaultTimeoutMs());
  const signal = AbortSignal.timeout(timeoutMs);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Race com timeout mesmo que o provedor ignore o signal (defesa em profundidade).
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timeout após ${timeoutMs}ms`)), timeoutMs);
    });
    const value = await Promise.race([fn(signal), timeout]);
    if (options.isFailure?.(value)) {
      const error =
        typeof value === "object" && value !== null && "error" in value && typeof (value as { error: unknown }).error === "string"
          ? (value as { error: string }).error
          : "falha reportada pelo provedor";
      recordFailure(key);
      logger.warn("integration_call_failed", { provider, key, error });
      return { status: "failed", error };
    }
    recordSuccess(key);
    return { status: "ok", value };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordFailure(key);
    logger.warn("integration_call_failed", { provider, key, error: message });
    return { status: "failed", error: message };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
