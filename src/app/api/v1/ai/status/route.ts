import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { requireTenantContext, assertPermission } from "@/core/tenant";

export const { GET } = apiHandler({
  GET: async (request: NextRequest) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "AI", "VIEW");
    const openCodeKey = !!process.env.OPENCODE_API_KEY;
    const openAiKey = !!process.env.OPENAI_API_KEY;
    const ollamaUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1";
    let ollamaAvailable = false;
    try {
      const r = await fetch(`${ollamaUrl}/models`, { method: "GET" });
      ollamaAvailable = r.ok;
    } catch {
      ollamaAvailable = false;
    }
    return Response.json({
      providers: {
        opencode: { configured: openCodeKey, baseUrl: process.env.OPENCODE_BASE_URL || "https://opencode.ai/zen/v1" },
        openai: { configured: openAiKey },
        ollama: { available: ollamaAvailable, baseUrl: ollamaUrl },
      },
      realAiAvailable: openCodeKey || openAiKey || ollamaAvailable,
      defaultModel: process.env.AI_MODEL || "glm-5.3-flash-free",
    });
  },
});