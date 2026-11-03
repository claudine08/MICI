import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { runAi } from "@/modules/ai/gateway";
import { AI_PROMPTS } from "@/modules/ai/prompts";
import { actorOf } from "@/modules/ai/http";

export const { POST } = apiHandler({
  POST: async (request: NextRequest) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "AI", "CREATE");
    const body = await request.json().catch(() => null);
    if (!body || typeof body.input !== "string" || typeof body.promptCode !== "string") {
      throw new AppError("VALIDATION_ERROR", "input e promptCode são obrigatórios.");
    }
    const mode = body.mode === "mock" || body.mode === "demo" || body.mode === "ollama" || body.mode === "openai" || body.mode === "opencode" ? body.mode : "opencode";
    const prompt = AI_PROMPTS.find((p) => p.code === body.promptCode);
    const systemPrompt = prompt ? prompt.template.replace("{{input}}", "") : undefined;
    const result = await runAi({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      projectId: body.projectId ?? null,
      promptCode: body.promptCode,
      input: body.input,
      systemPrompt: systemPrompt || "Você é um assistente técnico de gestão de projetos de cozinhas industriais. Responda em português.",
      model: prompt?.model,
      mode,
    });
    return Response.json(result);
  },
});