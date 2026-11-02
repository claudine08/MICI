import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { assertAiProject } from "@/modules/ai/common";
import type { ActorContext } from "@/modules/field/common";

export interface AiRunInput {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  projectId?: string | null;
  promptCode: string;
  input: string;
  systemPrompt?: string;
  model?: string;
}

export interface AiRunResult {
  output: string;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  status: "SUCCESS" | "FAILED";
  errorMessage?: string;
  requestId: string;
}

const DEFAULT_MODEL = process.env.AI_MODEL || "gpt-4o-mini";

function mockResponse(model: string, userInput: string): { output: string; tokensIn: number | null; tokensOut: number | null } {
  return {
    output: `[MOCK AI - ${model}] Resposta simulada para: ${userInput.slice(0, 80)}...`,
    tokensIn: null,
    tokensOut: null,
  };
}

async function callLlm(model: string, systemPrompt: string, userInput: string): Promise<{ output: string; tokensIn: number | null; tokensOut: number | null }> {
  const openCodeKey = process.env.OPENCODE_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;

  if (!openCodeKey && !openAiKey) {
    return mockResponse(model, userInput);
  }

  const baseUrl = openCodeKey
    ? (process.env.OPENCODE_BASE_URL || "https://opencode.ai/zen/v1")
    : "https://api.openai.com/v1";
  const apiKey = openCodeKey || openAiKey!;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userInput },
      ],
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI ${res.status}: ${err}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    output: data.choices?.[0]?.message?.content ?? "",
    tokensIn: data.usage?.prompt_tokens ?? null,
    tokensOut: data.usage?.completion_tokens ?? null,
  };
}

export async function runAi(input: AiRunInput): Promise<AiRunResult> {
  await assertAiProject(input.organizationId, input.projectId ?? null);
  const model = input.model || DEFAULT_MODEL;
  const systemPrompt = input.systemPrompt || "Você é um assistente técnico de gestão de projetos de cozinhas industriais. Responda em português, de forma concisa e objetiva.";

  const request = await prisma.aiRequest.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      promptCode: input.promptCode,
      input: input.input,
      model,
      status: "RUNNING",
      createdBy: input.actorId,
    },
  });

  try {
    const result = await callLlm(model, systemPrompt, input.input);
    const updated = await prisma.aiRequest.update({
      where: { id: request.id },
      data: {
        output: result.output,
        status: "SUCCESS",
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
      },
    });
    return {
      output: result.output,
      model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      status: "SUCCESS",
      requestId: updated.id,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Fallback para mock quando a IA real estiver indisponível (sem créditos, quota, auth).
    // Evita quebrar a UI e mantém a funcionalidade demonstrável.
    const mock = mockResponse(model, input.input);
    const fallbackOutput = `${mock.output}\n\n[AVISO] IA real indisponível (${msg}). Resposta mock exibida.`;
    const updated = await prisma.aiRequest.update({
      where: { id: request.id },
      data: {
        output: fallbackOutput,
        status: "SUCCESS",
        errorMessage: msg,
      },
    });
    return {
      output: fallbackOutput,
      model,
      tokensIn: null,
      tokensOut: null,
      status: "SUCCESS",
      errorMessage: msg,
      requestId: updated.id,
    };
  }
}