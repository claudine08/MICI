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
