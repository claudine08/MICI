import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  circuitState,
  isProviderEnabled,
  recordFailure,
  resetIsolation,
  safeCall,
} from "@/modules/integrations/isolation";

const ENV_KEYS = [
  "INTEGRATIONS_ENABLED",
  "EMAIL_ENABLED",
  "WHATSAPP_ENABLED",
  "WEBHOOKS_ENABLED",
  "INTEGRATION_CIRCUIT_THRESHOLD",
  "INTEGRATION_CIRCUIT_COOLDOWN_MS",
  "INTEGRATION_TIMEOUT_MS",
];

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  resetIsolation();
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetIsolation();
  vi.restoreAllMocks();
});

describe("kill switches (env)", () => {
  it("provedores ficam habilitados por padrão", () => {
    expect(isProviderEnabled("email")).toBe(true);
    expect(isProviderEnabled("whatsapp")).toBe(true);
    expect(isProviderEnabled("webhook")).toBe(true);
  });

  it("INTEGRATIONS_ENABLED=0 desliga todos os provedores", () => {
    process.env.INTEGRATIONS_ENABLED = "0";
    expect(isProviderEnabled("email")).toBe(false);
    expect(isProviderEnabled("whatsapp")).toBe(false);
    expect(isProviderEnabled("webhook")).toBe(false);
  });

  it("EMAIL_ENABLED=false desliga apenas o e-mail", () => {
    process.env.EMAIL_ENABLED = "false";
    expect(isProviderEnabled("email")).toBe(false);
    expect(isProviderEnabled("whatsapp")).toBe(true);
    expect(isProviderEnabled("webhook")).toBe(true);
  });
});

describe("safeCall (bulkhead)", () => {
  it("nunca lança: exceção do provedor vira failed", async () => {
    const result = await safeCall("email", "email", async () => {
      throw new Error("boom");
    });
    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.error).toBe("boom");
  });

  it("aplica timeout mesmo quando o provedor ignora o signal", async () => {
    const result = await safeCall("email", "email", () => new Promise(() => {}), {
      timeoutMs: 30,
    });
    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.error).toMatch(/timeout/);
  });

  it("aborta a chamada via signal quando o tempo estoura", async () => {
    const result = await safeCall(
      "email",
      "email",
      (signal) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("abortado")));
        }),
      { timeoutMs: 30 }
    );
    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.error).toBe("abortado");
  });

  it("valor { ok: false } conta como falha e abre o circuito após o limiar", async () => {
    process.env.INTEGRATION_CIRCUIT_THRESHOLD = "2";
    const fn = vi.fn(async () => ({ ok: false, error: "HTTP 500" }));
    const call = () =>
      safeCall("email", "email", fn, { isFailure: (value) => !value.ok });

    expect((await call()).status).toBe("failed");
    expect((await call()).status).toBe("failed");
    expect(circuitState("email")).toBe("open");

    // Circuit breaker: terceira chamada nem toca no provedor.
    const third = await call();
    expect(third).toEqual({ status: "skipped", reason: "circuit_open" });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("cooldown + sonda de sucesso fecham o circuito", async () => {
    process.env.INTEGRATION_CIRCUIT_THRESHOLD = "1";
    process.env.INTEGRATION_CIRCUIT_COOLDOWN_MS = "10";

    const failed = await safeCall("email", "email", async () => ({ ok: false, error: "x" }), {
      isFailure: (value) => !value.ok,
    });
    expect(failed.status).toBe("failed");
    expect(circuitState("email")).toBe("open");

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(circuitState("email")).toBe("half_open");

    const probe = await safeCall("email", "email", async () => ({ ok: true }));
    expect(probe.status).toBe("ok");
    expect(circuitState("email")).toBe("closed");
  });

  it("sonda half-open que falha mantém o circuito aberto", async () => {
    process.env.INTEGRATION_CIRCUIT_THRESHOLD = "1";
    process.env.INTEGRATION_CIRCUIT_COOLDOWN_MS = "10";

    recordFailure("email");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(circuitState("email")).toBe("half_open");

    await safeCall("email", "email", async () => ({ ok: false, error: "de novo" }), {
      isFailure: (value) => !value.ok,
    });
    expect(circuitState("email")).toBe("open");
  });

  it("provedor desabilitado não executa a função", async () => {
    process.env.WHATSAPP_ENABLED = "0";
    const fn = vi.fn(async () => ({ ok: true }));
    const result = await safeCall("whatsapp", "whatsapp", fn);
    expect(result).toEqual({ status: "skipped", reason: "disabled" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("circuito é isolado por chave (um endpoint caído não afeta os demais)", async () => {
    process.env.INTEGRATION_CIRCUIT_THRESHOLD = "1";
    recordFailure("webhook:endpoint-a");
    expect(circuitState("webhook:endpoint-a")).toBe("open");
    expect(circuitState("webhook:endpoint-b")).toBe("closed");
  });
});
