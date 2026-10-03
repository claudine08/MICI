import { NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { AppError, toErrorResponse } from "@/core/errors";

// Wrapper de route handler (§114): correlation id, log estruturado e contrato
// de erro único. Handlers focam na regra; aqui fica a infra transversal.

export function correlationIdOf(request: NextRequest): string {
  return request.headers.get("x-correlation-id") ?? crypto.randomUUID();
}

type HandlerArgs = [request: NextRequest, context: unknown];

interface ApiHandlers {
  GET?: (...args: HandlerArgs) => Promise<Response> | Response;
  POST?: (...args: HandlerArgs) => Promise<Response> | Response;
  PUT?: (...args: HandlerArgs) => Promise<Response> | Response;
  PATCH?: (...args: HandlerArgs) => Promise<Response> | Response;
  DELETE?: (...args: HandlerArgs) => Promise<Response> | Response;
}

type Wrapped<H> = {
  [K in keyof H]: (
    request: NextRequest,
    context: { params: Promise<Record<string, string | string[]>> }
  ) => Promise<Response>;
};

export function apiHandler<H extends ApiHandlers>(handlers: H): Wrapped<H> {
  const wrapped: Record<string, unknown> = {};
  for (const [method, handler] of Object.entries(handlers)) {
    if (!handler) continue;
    wrapped[method] = async (...args: HandlerArgs) => {
      const request = args[0] as NextRequest;
      const correlationId = correlationIdOf(request);
      const startedAt = Date.now();
      try {
        const response = await handler(...args);
        response.headers.set("x-correlation-id", correlationId);
        logger.info("request", {
          correlationId,
          method,
          path: new URL(request.url).pathname,
          status: response.status,
          durationMs: Date.now() - startedAt,
        });
        return response;
      } catch (error) {
        if (!(error instanceof AppError)) {
          logger.error("unhandled_error", {
            correlationId,
            method,
            path: new URL(request.url).pathname,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
        } else {
          logger.warn("app_error", {
            correlationId,
            method,
            path: new URL(request.url).pathname,
            code: error.code,
            message: error.message,
          });
        }
        const response = toErrorResponse(error, correlationId);
        response.headers.set("x-correlation-id", correlationId);
        return response;
      }
    };
  }
  return wrapped as Wrapped<H>;
}
