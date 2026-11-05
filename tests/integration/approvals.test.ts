import { randomBytes, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { AppError } from "@/core/errors";
import { createOrganization } from "@/modules/identity/services";
import { createProject } from "@/modules/portfolio/projects";
import {
  createApprovalRequest,
  getApprovalRequest,
  decideApprovalRequest,
} from "@/modules/integrations/approvals";

const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

let orgA: { id: string };
let userA: { id: string; email: string };
let projectId: string;

function actorA() {
  return { organizationId: orgA.id, actorId: userA.id, actorLabel: userA.email };
}

async function expectAppError(promise: Promise<unknown>, code: string): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return error as AppError;
  }
  throw new Error(`Esperava AppError "${code}", mas a operação concluiu.`);
}

beforeAll(async () => {
  const passwordHash = await hashPassword("Test@1234");
  userA = await prisma.user.create({
    data: { email: `appr-a-${suffix}@test.local`, name: "Appr A", passwordHash },
  });

  orgA = await createOrganization({
    name: `Org Appr A ${suffix}`,
    slug: `appr-a-${suffix}`,
    actorId: userA.id,
    actorEmail: userA.email,
  });

  const project = await createProject({
    ...actorA(),
    code: `PRJ-APPR-${suffix.toUpperCase()}`,
    name: "Projeto Appr Teste",
  });
  projectId = project.id;
});

describe("Aprovações por e-mail (integrações)", () => {
  it("cria solicitação e consulta por token", async () => {
    const approval = await createApprovalRequest({
      ...actorA(),
      projectId,
      objectType: "COST_ITEM",
      objectId: randomUUID(),
      approverEmail: `aprovador-${suffix}@test.local`,
      expiresInDays: 7,
      baseUrl: "http://localhost:3000",
    });
    expect(approval.status).toBe("PENDING");

    const found = await getApprovalRequest(approval.token);
    expect(found.id).toBe(approval.id);
    expect(found.status).toBe("PENDING");
  });

  it("decide aprovação e impede decisão duplicada", async () => {
    const approval = await createApprovalRequest({
      ...actorA(),
      projectId,
      objectType: "BUDGET",
      objectId: randomUUID(),
      approverEmail: `aprovador2-${suffix}@test.local`,
      baseUrl: "http://localhost:3000",
    });

    const decided = await decideApprovalRequest({
      token: approval.token,
      decision: "APPROVED",
      comment: "ok",
    });
    expect(decided.status).toBe("APPROVED");

    await expectAppError(
      decideApprovalRequest({ token: approval.token, decision: "REJECTED" }),
      "VALIDATION_ERROR"
    );
  });

  it("aprova custo total do projeto (PROJECT_COST_TOTAL)", async () => {
    const approval = await createApprovalRequest({
      ...actorA(),
      projectId,
      objectType: "PROJECT_COST_TOTAL",
      objectId: projectId,
      approverEmail: `aprovador4-${suffix}@test.local`,
      baseUrl: "http://localhost:3000",
    });
    expect(approval.status).toBe("PENDING");

    const decided = await decideApprovalRequest({
      token: approval.token,
      decision: "APPROVED",
      comment: "ok total",
      decidedByName: "Admin",
      decidedByEmail: `aprovador4-${suffix}@test.local`,
    });
    expect(decided.status).toBe("APPROVED");
    expect(decided.decidedByName).toBe("Admin");
  });

  it("expira solicitação vencida", async () => {
    const approval = await createApprovalRequest({
      ...actorA(),
      projectId,
      objectType: "COST_ITEM",
      objectId: randomUUID(),
      approverEmail: `aprovador3-${suffix}@test.local`,
      expiresInDays: 1,
      baseUrl: "http://localhost:3000",
    });

    // força expiração
    await prisma.approvalRequest.update({
      where: { id: approval.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const found = await getApprovalRequest(approval.token);
    expect(found.status).toBe("EXPIRED");
  });
});