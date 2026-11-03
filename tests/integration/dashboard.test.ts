import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { createOrganization } from "@/modules/identity/services";
import { createProject } from "@/modules/portfolio/projects";
import { createCostItem } from "@/modules/cost/items";
import { getPortfolioDashboard } from "@/modules/dashboard/portfolio";
import { getProjectDashboard } from "@/modules/dashboard/project";

const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

let orgA: { id: string };
let userA: { id: string; email: string };
let projectId: string;

function actorA() { return { organizationId: orgA.id, actorId: userA.id, actorLabel: userA.email }; }

beforeAll(async () => {
  const passwordHash = await hashPassword("Test@1234");
  userA = await prisma.user.create({ data: { email: `dash-a-${suffix}@test.local`, name: "DASH A", passwordHash } });
  orgA = await createOrganization({ name: `Org DASH ${suffix}`, slug: `dash-${suffix}`, actorId: userA.id, actorEmail: userA.email });
  const project = await createProject({ ...actorA(), code: `PRJ-DASH-${suffix.toUpperCase()}`, name: "Projeto Dashboard Teste", startDate: "2026-10-01", plannedEndDate: "2026-12-31" });
  projectId = project.id;
  await createCostItem({ ...actorA(), projectId, description: "Item de custo", category: "EQUIPAMENTO", unit: "un", quantity: 2, unitPrice: 100, amount: 200 });
});

describe("Dashboard (E17/E19) — integração", () => {
  it("portfolio retorna KPIs e lista de projetos", async () => {
    const data = await getPortfolioDashboard(orgA.id, "2026-11-02");
    expect(data.kpis.totalProjects).toBeGreaterThanOrEqual(1);
    expect(data.projects.length).toBeGreaterThanOrEqual(1);
    const row = data.projects.find((p) => p.id === projectId);
    expect(row).toBeDefined();
    expect(row!.bac).toBe(200);
  });

  it("project dashboard retorna KPIs, curva, burndown, gantt, heatmap, alertas", async () => {
    const data = await getProjectDashboard(orgA.id, projectId, "2026-11-02");
    expect(data.kpis.bac).toBe(200);
    expect(data.kpis.pv).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(data.curve)).toBe(true);
    expect(Array.isArray(data.burndown)).toBe(true);
    expect(Array.isArray(data.gantt)).toBe(true);
    expect(data.riskHeatmap.length).toBe(25);
    expect(Array.isArray(data.alerts)).toBe(true);
  });

  it("tenant isolation: projeto de outra org não é acessível", async () => {
    await expect(
      getProjectDashboard("00000000-0000-0000-0000-000000000000", projectId, "2026-11-02")
    ).rejects.toThrow();
  });
});