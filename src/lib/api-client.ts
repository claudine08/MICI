// Cliente leve de API para componentes client: contrato de erro único da spec.

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code ?? "UNKNOWN";
  }
}

// Sondeia o servidor depois de uma falha de rede para separar "internet/VPN
// fora" de "envio interrompido pelo navegador (extensão, antivírus, proxy)".
async function probeServer(): Promise<string> {
  try {
    const res = await fetch("/api/v1/health", {
      cache: "no-store",
      signal: typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(5000) : undefined,
    });
    if (res.ok) {
      return "Agora o servidor respondeu normalmente, então a falha foi específica do envio: tente novamente, ou use uma aba anônima/extensões desativadas.";
    }
    return `O servidor respondeu com HTTP ${res.status} na verificação.`;
  } catch {
    return "O servidor também não respondeu agora: sua conexão está instável neste momento.";
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  // Força JSON apenas para body string serializado. FormData/Blob precisam
  // do Content-Type automático do browser (multipart com boundary) — forçar
  // application/json aqui quebra o upload (servidor não consegue ler o form).
  if (typeof init?.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers,
    });
  } catch (error) {
    // fetch rejeitado = falha de rede/cors/conexão interrompida (ex.: upload
    // acima do limite do serverless). Devolve contrato de erro em vez do
    // TypeError cru "Failed to fetch" e registra a causa real (net::ERR_*)
    // no console para diagnóstico.
    console.error("[api] fetch rejeitado:", path, error, {
      cause: (error as { cause?: unknown })?.cause,
    });
    throw new ApiError(0, "Falha de conexão com o servidor. Verifique sua rede e tente novamente.", "NETWORK_ERROR");
  }

  const data = (await response.json().catch(() => null)) as
    | { error?: { message?: string; code?: string } }
    | null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error?.message ?? "Falha na requisição. Tente novamente.",
      data?.error?.code
    );
  }

  return data as T;
}

// Upload multipart via XHR: dá progresso real e diagnóstico granular (bytes
// enviados antes da queda) que fetch não expõe. Contrato de erro igual.
export function apiUpload<T>(
  path: string,
  formData: FormData,
  onProgress?: (percent: number) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let sent = 0;
    let total = 0;

    xhr.open("POST", path, true);
    xhr.upload.onprogress = (event) => {
      sent = event.loaded;
      total = event.total;
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      let data: { error?: { message?: string; code?: string } } | null = null;
      try {
        data = JSON.parse(xhr.responseText) as { error?: { message?: string; code?: string } };
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as T);
        return;
      }
      reject(
        new ApiError(
          xhr.status,
          data?.error?.message ?? "Falha na requisição. Tente novamente.",
          data?.error?.code
        )
      );
    };
    const failNetwork = async () => {
      console.error("[api] upload interrompido:", path, {
        sent,
        total,
        status: xhr.status,
        readyState: xhr.readyState,
      });
      const progress =
        total > 0
          ? ` Foram enviados ${sent} de ${total} bytes (${Math.round((sent / total) * 100)}%).`
          : " Nenhum byte foi enviado.";
      const detail = await probeServer();
      reject(
        new ApiError(
          0,
          `Falha de conexão com o servidor. Verifique sua rede e tente novamente.${progress} ${detail}`,
          "NETWORK_ERROR"
        )
      );
    };
    xhr.onerror = () => void failNetwork();
    xhr.onabort = () => void failNetwork();
    xhr.ontimeout = () => void failNetwork();
    xhr.send(formData);
  });
}
