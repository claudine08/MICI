// Rastreabilidade (E04/E07): requisitos <-> atividades do cronograma via WBS.
// Testa a função getProjectTraceability (extraída da rota /traceability).

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { createOrganization } from "@/modules/identity/services";
import { createProject } from "@/modules/portfolio/projects";
import { createWbsNode } from "@/modules/wbs/wbs";
import { createRequirement } from "@/modules/requirements/requirements";
import { getProjectTraceability } from "@/modules/requirements/traceability";

const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

let orgA: { id: string };
let userA: { id: string; email: string };
let projectId: string;
let wbsNodeId: string;
let requirementId: string;

function actorA() {
  return { organizationId: orgA.id, actorId: userA.id, actorLabel: userA.email };
}

beforeAll(async () => {
  const passwordHash = await hashPassword("Test@1234");
  userA = await prisma.user.create({
    data: { email: `trc-a-${suffix}@test.local`, name: "Trace A", passwordHash },
  });

  orgA = await createOrganization({
    name: `Org Trace A ${suffix}`,
    slug: `trc-a-${suffix}`,
    actorId: userA.id,
    actorEmail: userA.email,
  });

  const project = await createProject({
    ...actorA(),
    code: `PRJ-TRC-${suffix.toUpperCase()}`,
    name: "Projeto Rastreabilidade",
    status: "ACTIVE",
  });
  projectId = project.id;

  const wbsNode = await createWbsNode({ ...actorA(), projectId, code: "1", name: "Cozinha" });
  wbsNodeId = wbsNode.id;

  const requirement = await createRequirement({
    ...actorA(),
    projectId,
    code: "R001",
    description: "Requisito vinculado à WBS",
    category: "OPERATION",
    priority: "MEDIUM",
    status: "ACTIVE",
    wbsNodeId,
  });
  requirementId = requirement.id;

  // Atividade vinculada ao mesmo nó WBS
  await prisma.scheduleActivity.create({
    data: {
      organizationId: orgA.id,
      projectId,
      code: "A001",
      name: "Atividade vinculada",
      duration: 2,
      plannedStart: new Date("2026-11-02T00:00:00.000Z"),
      plannedFinish: new Date("2026-11-03T00:00:00.000Z"),
      wbsNodeId,
      orderIndex: 0,
      createdBy: userA.id,
      updatedBy: userA.id,
    },
  });

  // Atividade órfã (sem WBS)
  await prisma.scheduleActivity.create({
    data: {
      organizationId: orgA.id,
      projectId,
      code: "A002",
      name: "Atividade órfã",
      duration: 1,
      plannedStart: new Date("2026-11-04T00:00:00.000Z"),
      plannedFinish: new Date("2026-11-04T00:00:00.000Z"),
      orderIndex: 1,
      createdBy: userA.id,
      updatedBy: userA.id,
    },
  });
}, 60000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Rastreabilidade (E04/E07)", () => {
  it("retorna requisito com WBS e atividade vinculada", async () => {
    const result = await getProjectTraceability(orgA.id, projectId);

    expect(result.traceability).toHaveLength(1);
    const row = result.traceability[0];
    expect(row.requirement.code).toBe("R001");
    expect(row.requirement.evidenceCount).toBe(0);
    expect(row.wbs).not.toBeNull();
    expect(row.wbs?.code).toBe("1");
    expect(row.activities).toHaveLength(1);
    expect(row.activities[0].code).toBe("A001");
  });

  it("lista atividades órfãs em unlinkedActivities", async () => {
    const result = await getProjectTraceability(orgA.id, projectId);

    expect(result.unlinkedActivities).toHaveLength(1);
    expect(result.unlinkedActivities[0].code).toBe("A002");
  });

  it("summary reflete contagens corretas", async () => {
    const result = await getProjectTraceability(orgA.id, projectId);

    expect(result.summary.totalRequirements).toBe(1);
    expect(result.summary.totalActivities).toBe(2);
    expect(result.summary.linkedRequirements).toBe(1);
    expect(result.summary.linkedActivities).toBe(1);
    expect(result.summary.unlinkedRequirements).toBe(0);
    expect(result.summary.unlinkedActivities).toBe(1);
  });
});
