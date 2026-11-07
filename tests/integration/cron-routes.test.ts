import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as getNotifications } from "@/app/api/v1/cron/notifications/route";
import { GET as getWebhooks } from "@/app/api/v1/cron/webhooks/route";
import { GET as getBackup } from "@/app/api/v1/cron/backup/route";

// Crons do Vercel (Fase I3): o Vercel envia GET com
// `Authorization: Bearer $CRON_SECRET` — as rotas precisam aceitar GET e
// exigir o Bearer quando o secret estiver configurado.

const ENV_KEYS = ["CRON_SECRET", "NEON_API_KEY", "NEON_PROJECT_ID"];

let savedEnv: Record<string, string | undefined>;

function cronRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/v1/cron/notifications", { headers });
}

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
});

describe("rotas de cron", () => {
  it("GET é aceito e autenticado pelo CRON_SECRET", async () => {
    savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    process.env.CRON_SECRET = "segredo-de-teste";
    delete process.env.NEON_API_KEY;
    delete process.env.NEON_PROJECT_ID;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 })));

    // Sem Bearer → 403 (não autenticado).
    const denied = await getNotifications(cronRequest(), {
      params: Promise.resolve({}),
    });
    expect(denied.status).toBe(403);

    // Com Bearer correto → executa.
    const allowed = await getNotifications(
      cronRequest({ authorization: "Bearer segredo-de-teste" }),
      { params: Promise.resolve({}) }
    );
    expect(allowed.status).toBe(200);
    expect((await allowed.json()).ok).toBe(true);
  });

  it("cron de webhooks aceita GET com o secret", async () => {
    savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    process.env.CRON_SECRET = "segredo-de-teste";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 })));

    const response = await getWebhooks(
      cronRequest({ authorization: "Bearer segredo-de-teste" }),
      { params: Promise.resolve({}) }
    );
    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
  });

  it("cron de backup aceita GET e responde 'nada feito' sem config do Neon", async () => {
    savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    process.env.CRON_SECRET = "segredo-de-teste";
    delete process.env.NEON_API_KEY;
    delete process.env.NEON_PROJECT_ID;

    const response = await getBackup(
      cronRequest({ authorization: "Bearer segredo-de-teste" }),
      { params: Promise.resolve({}) }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.provider).toBe("none");
  });
});
