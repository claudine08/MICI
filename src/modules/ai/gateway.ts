import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { assertAiProject, type ActorContext } from "@/modules/ai/common";

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

async function callOpenAI(model: string, systemPrompt: string, userInput: string): Promise<{ output: string; tokensIn: number | null; tokensOut: number | null }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Mock para desenvolvimento sem chave
    return {
      output: `[MOCK AI - ${model}] Resposta simulada para: ${userInput.slice(0, 80)}...`,
      tokensIn: null,
      tokensOut: null,
    };
  }
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
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
    const result = await callOpenAI(model, systemPrompt, input.input);
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
    await prisma.aiRequest.update({
      where: { id: request.id },
      data: { status: "FAILED", errorMessage: msg },
    });
    return {
      output: "",
      model,
      tokensIn: null,
      tokensOut: null,
      status: "FAILED",
      errorMessage: msg,
      requestId: request.id,
    };
  }
}