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
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

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
