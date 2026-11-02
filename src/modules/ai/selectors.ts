import { prisma } from "@/lib/prisma";

export interface AiRequestRow {
  id: string;
  promptCode: string;
  input: string;
  output: string | null;
  model: string;
  status: string;
  errorMessage: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  createdAt: string;
}

export async function listAiRequests(organizationId: string, projectId?: string | null, limit = 50): Promise<AiRequestRow[]> {
  const rows = await prisma.aiRequest.findMany({
    where: { organizationId, ...(projectId ? { projectId } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    promptCode: r.promptCode,
    input: r.input,
    output: r.output,
    model: r.model,
    status: r.status,
    errorMessage: r.errorMessage,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    createdAt: r.createdAt.toISOString(),
  }));
}