// Integração nativa com WhatsApp Business API (Meta Cloud API).
// Envia mensagens de template para números cadastrados em User.phone.

// O `signal` vem do safeCall (timeout/circuit breaker); sem ele, aplica
// timeout padrão de 10s — nunca fica pendurado em chamada de rede.
export async function sendWhatsAppTemplate(input: {
  to: string;
  templateName: string;
  params?: string[];
  languageCode?: string;
  signal?: AbortSignal;
}): Promise<{ ok: boolean; error?: string }> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    // eslint-disable-next-line no-console
    console.log("[whatsapp:dev]", input);
    return { ok: true };
  }

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: input.to,
    type: "template",
    template: {
      name: input.templateName,
      language: { code: input.languageCode ?? "pt_BR" },
      components: input.params?.length
        ? [
            {
              type: "body",
              parameters: input.params.map((p) => ({ type: "text", text: p })),
            },
          ]
        : [],
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: input.signal ?? AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}