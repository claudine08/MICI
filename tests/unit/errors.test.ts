import { describe, expect, it } from "vitest";
import { AppError, isAppError, toErrorResponse } from "@/core/errors";

describe("contrato de erro da API", () => {
  it("mapeia códigos para status HTTP corretos", () => {
    expect(new AppError("UNAUTHENTICATED", "x").status).toBe(401);
    expect(new AppError("FORBIDDEN", "x").status).toBe(403);
    expect(new AppError("NOT_FOUND", "x").status).toBe(404);
    expect(new AppError("VALIDATION_ERROR", "x").status).toBe(422);
    expect(new AppError("CONFLICT", "x").status).toBe(409);
    expect(new AppError("INTERNAL", "x").status).toBe(500);
  });

  it("serializa o corpo { error: { code, message, correlation_id } }", async () => {
    const error = new AppError("FORBIDDEN", "Permissão negada", {
      details: { required: "PROJECT:EDIT" },
    });
    const response = toErrorResponse(error, "corr-123");
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "Permissão negada",
        details: { required: "PROJECT:EDIT" },
        correlation_id: "corr-123",
      },
    });
  });

  it("esconde detalhes de erro não tratado (500)", async () => {
    const response = toErrorResponse(new Error("stacktrace secreta"), "corr-456");
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("INTERNAL");
    expect(body.error.correlation_id).toBe("corr-456");
    expect(JSON.stringify(body)).not.toContain("stacktrace");
  });

  it("isAppError distingue AppError", () => {
    expect(isAppError(new AppError("CONFLICT", "x"))).toBe(true);
    expect(isAppError(new Error("x"))).toBe(false);
  });
});
