import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { AppError } from "@/core/errors";
import { createOrganization } from "@/modules/identity/services";
import { createProject } from "@/modules/portfolio/projects";
import { runAi } from "@/modules/ai/gateway";
import { listAiRequests } from "@/modules/ai/selectors";

const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

let orgA: { id: string };
let userA: { id: string; email: string };
let projectId: string;

function actorA() { return { organizationId: orgA.id, actorId: userA.id, actorLabel: userA.email }; }

beforeAll(async () => {
  const passwordHash = await hashPassword("Test@1234");
  userA = await prisma.user.create({ data: { email: `ai-a-${suffix}@test.local`, name: "AI A", passwordHash } });
  orgA = await createOrganization({ name: `Org AI ${suffix}`, slug: `ai-${suffix}`, actorId: userA.id, actorEmail: userA.email });
  const project = await createProject({ ...actorA(), code: `PRJ-AI-${suffix.toUpperCase()}`, name: "Projeto AI Teste" });
  projectId = project.id;
});

describe("AI (E18) — integração", () => {
  it("run mock retorna SUCCESS", async () => {
    const result = await runAi({ ...actorA(), projectId, promptCode: "DAILY_SUMMARY", input: "Diario teste", mode: "mock" });
    expect(result.status).toBe("SUCCESS");
    expect(result.output).toContain("MOCK AI");
  });

  it("run demo retorna SUCCESS com tokens simulados", async () => {
    const result = await runAi({ ...actorA(), projectId, promptCode: "DAILY_SUMMARY", input: "Diario teste", mode: "demo" });
    expect(result.status).toBe("SUCCESS");
    expect(result.tokensIn).toBe(120);
  });

  it("run persiste AiRequest", async () => {
    const result = await runAi({ ...actorA(), projectId, promptCode: "RISK_CLASSIFY", input: "Risco de atraso", mode: "mock" });
    const rows = await listAiRequests(orgA.id, projectId);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.id === result.requestId)).toBe(true);
  });

  it("listAiRequests filtra por projeto", async () => {
    await runAi({ ...actorA(), promptCode: "DOC_EXTRACT", input: "doc teste", mode: "mock" });
    const all = await listAiRequests(orgA.id, null);
    const byProject = await listAiRequests(orgA.id, projectId);
    expect(all.length).toBeGreaterThanOrEqual(byProject.length);
  });

  it("run sem projeto (projectId null) funciona", async () => {
    const result = await runAi({ ...actorA(), projectId: null, promptCode: "SEMANTIC_SEARCH", input: "busca", mode: "mock" });
    expect(result.status).toBe("SUCCESS");
  });
});