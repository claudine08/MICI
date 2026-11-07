// Serviço de e-mail (integrações). Usa Resend se RESEND_API_KEY estiver
// configurado; caso contrário, registra no console (útil em dev).
// O `signal` vem do safeCall (timeout/circuit breaker); sem ele, aplica
// timeout padrão de 10s — nunca fica pendurado em chamada de rede.
export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  signal?: AbortSignal;
}): Promise<{ ok: boolean; provider: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "MICI <noreply@mici.local>";
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.log("[email:dev]", { to: input.to, subject: input.subject, html: input.html });
    return { ok: true, provider: "console" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
      signal: input.signal ?? AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, provider: "resend", error: `HTTP ${res.status}: ${body}` };
    }
    return { ok: true, provider: "resend" };
  } catch (err) {
    return { ok: false, provider: "resend", error: err instanceof Error ? err.message : String(err) };
  }
}