// Contrato de erro único da API (§114 — runbook de API).
// Todo erro de API responde: { error: { code, message, details?, correlation_id } }

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "SESSION_USER_NOT_FOUND"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "VERSION_CONFLICT"
  | "BASELINE_IMMUTABLE"
  | "GATE_CRITERIA_PENDING"
  | "GATE_EVIDENCE_REQUIRED"
  | "PHASE_ADVANCE_BLOCKED"
  | "REQUIREMENT_COMPLETION_BLOCKED"
  | "REQUIREMENTS_INCOMPLETE"
  | "COST_BASELINE_REQUIRED"
  | "DOCUMENT_IMMUTABLE"
  | "DOCUMENT_INVALID_STATE"
  | "RISK_INVALID_STATE"
  | "CHANGE_INVALID_STATE"
  | "FIELD_INVALID_STATE"
  | "ORGANIZATION_REQUIRED"
  | "INTERNAL";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  SESSION_USER_NOT_FOUND: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  CONFLICT: 409,
  VERSION_CONFLICT: 409,
  BASELINE_IMMUTABLE: 409,
  GATE_CRITERIA_PENDING: 409,
  GATE_EVIDENCE_REQUIRED: 409,
  PHASE_ADVANCE_BLOCKED: 409,
  REQUIREMENT_COMPLETION_BLOCKED: 409,
  REQUIREMENTS_INCOMPLETE: 409,
  COST_BASELINE_REQUIRED: 409,
  DOCUMENT_IMMUTABLE: 409,
  DOCUMENT_INVALID_STATE: 409,
  RISK_INVALID_STATE: 409,
  CHANGE_INVALID_STATE: 409,
  FIELD_INVALID_STATE: 409,
  ORGANIZATION_REQUIRED: 400,
  INTERNAL: 500,
};

export interface AppErrorOptions {
  details?: unknown;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = options.details;
  }

  toBody(correlationId: string) {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== undefined ? { details: this.details } : {}),
        correlation_id: correlationId,
      },
    };
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toErrorResponse(error: unknown, correlationId: string): Response {
  if (isAppError(error)) {
    return Response.json(error.toBody(correlationId), { status: error.status });
  }
  const body = {
    error: {
      code: "INTERNAL" satisfies ErrorCode,
      message: "Erro interno. Tente novamente ou contate o suporte.",
      correlation_id: correlationId,
    },
  };
  return Response.json(body, { status: 500 });
}
