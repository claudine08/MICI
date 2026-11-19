import type { NextRequest } from "next/server";
import { AppError } from "@/core/errors";
import { getRfiResponseByToken, submitRfiResponseByToken } from "@/modules/supplier-rfi/supplier-rfi";

async function tokenFrom(context: unknown): Promise<string> {
  const { token } = await (context as { params: Promise<{ token: string }> }).params;
  if (!token) throw new AppError("VALIDATION_ERROR", "Token ausente.");
  return token;
}

export async function GET(_request: NextRequest, context: unknown) {
  try {
    const token = await tokenFrom(context);
    const data = await getRfiResponseByToken(token);
    return Response.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro.";
    const status = e instanceof AppError ? (e.code === "NOT_FOUND" ? 404 : 400) : 500;
    return Response.json({ error: { code: "ERROR", message: msg } }, { status });
  }
}

export async function POST(request: NextRequest, context: unknown) {
  try {
    const token = await tokenFrom(context);
    const body = await request.json().catch(() => ({}));
    const result = await submitRfiResponseByToken(token, {
      quotedAmount: body?.quotedAmount != null ? Number(body.quotedAmount) : undefined,
      leadTimeDays: body?.leadTimeDays != null ? Number(body.leadTimeDays) : undefined,
      notes: body?.notes ?? null,
    });
    return Response.json(result, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro.";
    const status = e instanceof AppError ? (e.code === "NOT_FOUND" ? 404 : 400) : 500;
    return Response.json({ error: { code: "ERROR", message: msg } }, { status });
  }
}