import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { AppError } from "@/core/errors";
import { createOrganization } from "@/modules/identity/services";
import { createClient } from "@/modules/portfolio/clients";
import { createProject } from "@/modules/portfolio/projects";
import {
  getDrpDocument,
  getRequirementDetail,
  listRequirementRevisions,
  listRequirements,
} from "@/modules/requirements/selectors";
import {
  addRequirementEvidence,
  createRequirement,
  removeRequirementEvidence,
  reviewRequirement,
  updateRequirement,
} from "@/modules/requirements/requirements";
import { renderDrpMarkdown } from "@/modules/requirements/engine";
import { listProjectGateInstances, transitionGate, setGateCriteria, addGateEvidence } from "@/modules/gates/instances";
import { createWbsNode } from "@/modules/wbs/wbs";

// Requisitos + DRP (E04) — BR-008/BR-015, versionamento, vínculo com WBS e
// checagem do gate G1 (§18) no CI.

const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

let orgA: { id: string };
let orgB: { id: string };
let userA: { id: string; email: string };
let userB: { id: string; email: string };
let projectId: string;
let g1ProjectId: string;
let wbsNodeId: string;

function actorA() {
  return {
    organizationId: orgA.id,
    actorId: userA.id,
    actorLabel: userA.email,
  };
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
    data: { email: `req-a-${suffix}@test.local`, name: "Req A", passwordHash },
  });
  userB = await prisma.user.create({
    data: { email: `req-b-${suffix}@test.local`, name: "Req B", passwordHash },
  });

  orgA = await createOrganization({
    name: `Org Requisitos A ${suffix}`,
    slug: `req-a-${suffix}`,
    actorId: userA.id,
    actorEmail: userA.email,
  });
  orgB = await createOrganization({
    name: `Org Requisitos B ${suffix}`,
    slug: `req-b-${suffix}`,
    actorId: userB.id,
    actorEmail: userB.email,
  });

  const client = await createClient({
    ...actorA(),
    code: `CLI-${suffix.toUpperCase()}`,
    name: "Cliente Requisitos",
  });

  const project = await createProject({
    ...actorA(),
    code: `PRJ-${suffix.toUpperCase()}`,
    name: "Projeto Requisitos",
    clientId: client.id,
    status: "ACTIVE",
    startDate: "2026-01-01",
  });
  projectId = project.id;

  const g1Project = await createProject({
    ...actorA(),
    code: `G1-${suffix.toUpperCase()}`,
    name: "Projeto G1",
    clientId: client.id,
    status: "ACTIVE",
    startDate: "2026-01-01",
  });
  g1ProjectId = g1Project.id;

  const wbsRoot = await createWbsNode({
    ...actorA(),
    projectId,
    name: "Bloco A",
    nodeType: "SUMMARY",
  });
  wbsNodeId = wbsRoot.id;
}, 60000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("cadastro de requisitos (E04-US01)", () => {
  it("gera código REQ-### por projeto", async () => {
    const first = await createRequirement({
      ...actorA(),
      projectId,
      description: "Plano de manutenção das edificações",
      acceptanceCriteria: "Plano aprovado pela gestão",
      ownerId: userA.id,
    });
    expect(first.code).toBe("REQ-001");
    expect(first.status).toBe("DRAFT");
    expect(first.revision).toBe(1);

    const second = await createRequirement({
      ...actorA(),
      projectId,
      description: "Rotina de inspeção de fachadas",
    });
    expect(second.code).toBe("REQ-002");
  });

  it("código duplicado conflita", async () => {
    await expect(
      createRequirement({ ...actorA(), projectId, code: "req-001", description: "Duplicado" })
    ).rejects.toThrowError(/já existe/i);
  });

  it("vínculo com WBS é registrado no detalhe (E04-US03)", async () => {
    const requirement = await createRequirement({
      ...actorA(),
      projectId,
      description: "Sinalização de acessibilidade",
      wbsNodeId,
    });
    const detail = await getRequirementDetail(orgA.id, requirement.id);
    expect(detail.wbsNodeId).toBe(wbsNodeId);
    expect(detail.wbsNodeCode).toBe("1");
  });

  it("BR-015: requisito regulatório exige fonte e vigência", async () => {
    const error = await expectAppError(
      createRequirement({
        ...actorA(),
        projectId,
        description: "Atendimento à NBR 9050",
        category: "COMPLIANCE",
      }),
      "VALIDATION_ERROR"
    );
    expect(error.message).toMatch(/BR-015/);

    const ok = await createRequirement({
      ...actorA(),
      projectId,
      description: "Atendimento à NBR 9050",
      category: "COMPLIANCE",
      source: "NBR 9050",
      sourceValidUntil: "2030-12-31",
    });
    expect(ok.category).toBe("COMPLIANCE");
  });
});

describe("versionamento (E04-US02) e revisão (§20)", () => {
  it("toda edição cria uma RequirementRevision", async () => {
    const requirement = await createRequirement({
      ...actorA(),
      projectId,
      description: "Requisito versionado",
    });

    const updated = await updateRequirement({
      ...actorA(),
      requirementId: requirement.id,
      priority: "CRITICAL",
      changeSummary: "Prioridade ajustada",
    });
    expect(updated.revision).toBe(2);
    expect(updated.priority).toBe("CRITICAL");

    const revisions = await listRequirementRevisions(orgA.id, requirement.id);
    expect(revisions).toHaveLength(2);
    expect(revisions[0].revision).toBe(2);
    expect(revisions[0].changeSummary).toBe("Prioridade ajustada");
    expect(revisions[1].changeSummary).toBe("Criação");
  });

  it("transição inválida é bloqueada pela máquina de estados", async () => {
    const requirement = await createRequirement({
      ...actorA(),
      projectId,
      description: "Transição inválida",
    });
    await expect(
      updateRequirement({
        ...actorA(),
        requirementId: requirement.id,
        status: "COMPLETED",
      })
    ).rejects.toThrowError(/Transição inválida/);
  });

  it("carimbo de revisão do DRP registra lastReviewedAt", async () => {
    const requirement = await createRequirement({
      ...actorA(),
      projectId,
      description: "Requisito revisado",
    });
    const result = await reviewRequirement({ ...actorA(), requirementId: requirement.id });
    expect(result.lastReviewedAt).toBeInstanceOf(Date);

    const detail = await getRequirementDetail(orgA.id, requirement.id);
    expect(detail.lastReviewedAt).not.toBeNull();
  });
});

describe("BR-008 — conclusão exige evidência", () => {
  it("bloqueia conclusão sem evidência e libera após vincular", async () => {
    const requirement = await createRequirement({
      ...actorA(),
      projectId,
      description: "Sistema de drenagem",
      acceptanceCriteria: "Ensaio de estanqueidade aprovado",
      status: "ACTIVE",
    });

    const blocked = await expectAppError(
      updateRequirement({ ...actorA(), requirementId: requirement.id, status: "COMPLETED" }),
      "REQUIREMENT_COMPLETION_BLOCKED"
    );
    expect(blocked.status).toBe(409);
    expect(blocked.message).toMatch(/BR-008/);

    const { evidence } = await addRequirementEvidence({
      ...actorA(),
      requirementId: requirement.id,
      label: "Relatório de ensaio",
    });

    const completed = await updateRequirement({
      ...actorA(),
      requirementId: requirement.id,
      status: "COMPLETED",
    });
    expect(completed.status).toBe("COMPLETED");

    const detail = await getRequirementDetail(orgA.id, requirement.id);
    expect(detail.evidenceCount).toBe(1);
    expect(detail.evidences[0].label).toBe("Relatório de ensaio");

    const removed = await removeRequirementEvidence({
      ...actorA(),
      requirementId: requirement.id,
      evidenceId: evidence.id,
    });
    expect(removed.evidenceId).toBe(evidence.id);
    expect((await getRequirementDetail(orgA.id, requirement.id)).evidenceCount).toBe(0);
  });
});

describe("DRP (E04-US05, §20)", () => {
  it("agrega requisitos vivos do projeto e renderiza markdown", async () => {
    const document = await getDrpDocument(orgA.id, projectId, "Req A");
    expect(document.totals.total).toBeGreaterThan(0);
    expect(document.project.code).toBe(`PRJ-${suffix.toUpperCase()}`);
    expect(document.requirements.some((item) => item.code === "REQ-001")).toBe(true);

    const markdown = renderDrpMarkdown(document);
    expect(markdown).toContain("# Documento de Requisitos do Projeto (DRP)");
    expect(markdown).toContain("REQ-001");
  });
});

describe("gate G1 (§18) — aprovação exige DRP completo", () => {
  it("bloqueia aprovação sem requisitos e aprova com DRP pronto", async () => {
    const gates = await listProjectGateInstances(orgA.id, g1ProjectId, userA.id);
    const g1 = gates.find((gate) => gate.code === "G1")!;

    await transitionGate({ ...actorA(), instanceId: g1.id, action: "start" });
    await transitionGate({ ...actorA(), instanceId: g1.id, action: "submit" });
    await transitionGate({ ...actorA(), instanceId: g1.id, action: "analyze" });
    await setGateCriteria({
      ...actorA(),
      instanceId: g1.id,
      results: g1.criteria.map((criterion) => ({
        criterionCode: criterion.code,
        completed: true,
      })),
    });
    await addGateEvidence({ ...actorA(), instanceId: g1.id, label: "Ata da reunião" });

    const blocked = await expectAppError(
      transitionGate({ ...actorA(), instanceId: g1.id, action: "approve" }),
      "REQUIREMENTS_INCOMPLETE"
    );
    expect(blocked.status).toBe(409);
    expect(blocked.message).toMatch(/ao menos um requisito/);

    const requirement = await createRequirement({
      ...actorA(),
      projectId: g1ProjectId,
      description: "Levantamento completo do sistema predial",
      acceptanceCriteria: "DRP validado com o cliente",
      ownerId: userA.id,
      status: "ACTIVE",
    });
    await addRequirementEvidence({
      ...actorA(),
      requirementId: requirement.id,
      label: "Ata de levantamento",
    });

    const approved = await transitionGate({
      ...actorA(),
      instanceId: g1.id,
      action: "approve",
    });
    expect(approved.status).toBe("APPROVED");
  });
});

describe("isolamento de tenant — requisitos", () => {
  it("listagem escopada ao tenant não retorna requisitos de outro tenant", async () => {
    const fromA = await listRequirements(orgA.id, { projectId });
    expect(fromA.length).toBeGreaterThan(0);

    const fromB = await listRequirements(orgB.id, { projectId });
    expect(fromB).toHaveLength(0);
  });

  it("detalhe de requisito de outro tenant é NOT_FOUND", async () => {
    const [requirement] = await listRequirements(orgA.id, { projectId });
    await expectAppError(getRequirementDetail(orgB.id, requirement.id), "NOT_FOUND");
  });

  it("edição de requisito de outro tenant é NOT_FOUND", async () => {
    const [requirement] = await listRequirements(orgA.id, { projectId });
    await expectAppError(
      updateRequirement({
        ...actorA(),
        organizationId: orgB.id,
        requirementId: requirement.id,
        priority: "LOW",
      }),
      "NOT_FOUND"
    );
  });
});
