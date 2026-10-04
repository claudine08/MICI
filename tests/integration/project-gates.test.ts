import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { AppError } from "@/core/errors";
import { createOrganization } from "@/modules/identity/services";
import { listGateDefinitions, updateGateDefinition, deleteGateDefinition } from "@/modules/gates/definitions";
import {
  listProjectGateInstances,
  transitionGate,
  setGateCriteria,
  addGateEvidence,
} from "@/modules/gates/instances";
import { changeProjectPhase } from "@/modules/gates/phase-gate";
import { createClient } from "@/modules/portfolio/clients";
import { createProject } from "@/modules/portfolio/projects";
import { getProjectDetail, listProjects } from "@/modules/portfolio/selectors";
import { listAuditEvents } from "@/core/audit";

// Portfólio + Gates (E03, E06) — BR-001/BR-002 e isolamento de tenant no CI.

const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

let orgA: { id: string };
let orgB: { id: string };
let userA: { id: string; email: string };
let userB: { id: string; email: string };
let projectId: string;
let clientAId: string;

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
    data: { email: `gates-a-${suffix}@test.local`, name: "Gates A", passwordHash },
  });
  userB = await prisma.user.create({
    data: { email: `gates-b-${suffix}@test.local`, name: "Gates B", passwordHash },
  });

  orgA = await createOrganization({
    name: `Org Gates A ${suffix}`,
    slug: `gates-a-${suffix}`,
    actorId: userA.id,
    actorEmail: userA.email,
  });
  orgB = await createOrganization({
    name: `Org Gates B ${suffix}`,
    slug: `gates-b-${suffix}`,
    actorId: userB.id,
    actorEmail: userB.email,
  });

  const clientA = await createClient({
    ...actorA(),
    code: `CLI-${suffix.toUpperCase()}`,
    name: "Cliente Gates",
  });
  clientAId = clientA.id;

  const project = await createProject({
    ...actorA(),
    code: `PRJ-${suffix.toUpperCase()}`,
    name: "Projeto Gates",
    clientId: clientAId,
    status: "ACTIVE",
    startDate: "2026-01-01",
  });
  projectId = project.id;
}, 60000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("gate definitions (E06-US01/US03)", () => {
  it("toda organização nova recebe os gates oficiais G0–G8", async () => {
    const definitions = await listGateDefinitions(orgA.id);
    expect(definitions.map((definition) => definition.code).sort()).toEqual([
      "G0", "G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8",
    ]);
    expect(definitions.every((definition) => definition.isSystem)).toBe(true);
    expect(definitions.every((definition) => definition.criteria.length > 0)).toBe(true);

    const definitionsB = await listGateDefinitions(orgB.id);
    expect(definitionsB).toHaveLength(9);
  });

  it("gate do sistema não pode ser removido", async () => {
    const definitions = await listGateDefinitions(orgA.id);
    await expect(
      deleteGateDefinition({ ...actorA(), definitionId: definitions[0].id })
    ).rejects.toThrowError(/sistema/i);
  });

  it("edição da definição não altera o snapshot de projetos existentes (§15.1)", async () => {
    const before = await listProjectGateInstances(orgA.id, projectId, userA.id);
    const g2 = before.find((gate) => gate.code === "G2")!;

    const definitions = await listGateDefinitions(orgA.id);
    const g2Definition = definitions.find((definition) => definition.code === "G2")!;
    await updateGateDefinition({
      ...actorA(),
      definitionId: g2Definition.id,
      name: "Viabilidade (editado)",
      criteria: [{ description: "Novo critério único" }],
    });

    const after = await listProjectGateInstances(orgA.id, projectId, userA.id);
    const g2After = after.find((gate) => gate.id === g2.id)!;
    expect(g2After.criteria).toEqual(g2.criteria);

    // a definição foi realmente alterada (só a instância antiga não acompanha)
    const definitionsAfter = await listGateDefinitions(orgA.id);
    const g2DefinitionAfter = definitionsAfter.find((definition) => definition.code === "G2")!;
    expect(g2DefinitionAfter.name).toBe("Viabilidade (editado)");
    expect(g2DefinitionAfter.criteria).toHaveLength(1);

    // restaura para não afetar os demais testes
    await updateGateDefinition({
      ...actorA(),
      definitionId: g2Definition.id,
      name: "Viabilidade",
      criteria: g2Definition.criteria.map((criterion) => ({
        description: criterion.description,
        required: criterion.required,
      })),
    });
  });
});

describe("projeto e instâncias de gate (E03/E06-US02)", () => {
  it("criação do projeto gera snapshot com instâncias NOT_STARTED", async () => {
    const gates = await listProjectGateInstances(orgA.id, projectId, userA.id);
    expect(gates).toHaveLength(9);
    expect(gates.every((gate) => gate.status === "NOT_STARTED")).toBe(true);
    expect(gates.every((gate) => gate.criteria.length > 0)).toBe(true);
  });

  it("código de projeto duplicado conflita", async () => {
    await expect(
      createProject({ ...actorA(), code: `PRJ-${suffix.toUpperCase()}`, name: "Duplicado" })
    ).rejects.toThrowError(/já existe/i);
  });

  it("listProjects é escopado ao tenant", async () => {
    const projectsA = await listProjects(orgA.id);
    expect(projectsA.map((project) => project.id)).toContain(projectId);

    const projectsB = await listProjects(orgB.id);
    expect(projectsB.map((project) => project.id)).not.toContain(projectId);
  });
});

describe("isolamento de tenant — portfólio e gates", () => {
  it("detalhe de projeto de outro tenant é NOT_FOUND", async () => {
    await expectAppError(getProjectDetail(orgB.id, projectId), "NOT_FOUND");
  });

  it("instâncias de gate de outro tenant são NOT_FOUND", async () => {
    await expectAppError(listProjectGateInstances(orgB.id, projectId, userB.id), "NOT_FOUND");
  });

  it("avanço de fase de outro tenant é NOT_FOUND", async () => {
    await expectAppError(
      changeProjectPhase({ ...actorA(), organizationId: orgB.id, projectId, direction: "advance" }),
      "NOT_FOUND"
    );
  });
});

describe("BR-001 — avanço de fase bloqueado sem gate", () => {
  it("bloqueia a saída de F0 enquanto G0 não for aprovado/dispensado", async () => {
    const error = await expectAppError(
      changeProjectPhase({ ...actorA(), projectId, direction: "advance" }),
      "PHASE_ADVANCE_BLOCKED"
    );
    expect(error.details).toMatchObject({
      currentPhase: "F0",
      targetPhase: "F1",
      pendingGates: [{ code: "G0" }],
    });
  });

  it("libera o avanço depois de G0 aprovado e audita a decisão", async () => {
    const gates = await listProjectGateInstances(orgA.id, projectId, userA.id);
    const g0 = gates.find((gate) => gate.code === "G0")!;

    // Máquina de estados: start → submit → analyze.
    const started = await transitionGate({ ...actorA(), instanceId: g0.id, action: "start" });
    expect(started.status).toBe("IN_PROGRESS");

    const approved = await runApproveFlow(g0.id);
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvals).toHaveLength(1);

    const audit = await listAuditEvents({
      organizationId: orgA.id,
      objectType: "GateInstance",
      objectId: g0.id,
      pageSize: 100,
    });
    const actions = audit.items.map((item) => item.action);
    expect(actions).toContain("START");
    expect(actions).toContain("ADD_EVIDENCE");
    expect(actions).toContain("APPROVE");

    const result = await changeProjectPhase({ ...actorA(), projectId, direction: "advance" });
    expect(result).toEqual({ previousPhase: "F0", currentPhase: "F1" });

    const phaseAudit = await prisma.auditEvent.findFirst({
      where: { organizationId: orgA.id, projectId, action: "PHASE_ADVANCE" },
    });
    expect(phaseAudit).not.toBeNull();
    const project = await getProjectDetail(orgA.id, projectId);
    expect(project.currentPhase).toBe("F1");
  });
});

// Executa o fluxo completo até aprovar: critérios + evidência (BR-002).
async function runApproveFlow(instanceId: string) {
  await transitionGate({ ...actorA(), instanceId, action: "submit" });
  await transitionGate({ ...actorA(), instanceId, action: "analyze" });

  const pending = await expectAppError(
    transitionGate({ ...actorA(), instanceId, action: "approve" }),
    "GATE_CRITERIA_PENDING"
  );
  const blocks = (pending.details as { blocks: { code: string }[] }).blocks;
  expect(blocks[0]?.code).toBe("GATE_CRITERIA_PENDING");
  expect(blocks[1]?.code).toBe("GATE_EVIDENCE_REQUIRED");

  const before = await getGate(instanceId);
  await setGateCriteria({
    ...actorA(),
    instanceId,
    results: before.criteria
      .filter((criterion) => criterion.required)
      .map((criterion) => ({ criterionCode: criterion.code, completed: true })),
  });

  const noEvidence = await expectAppError(
    transitionGate({ ...actorA(), instanceId, action: "approve" }),
    "GATE_EVIDENCE_REQUIRED"
  );
  expect(noEvidence.message).toMatch(/BR-002/);

  await addGateEvidence({ ...actorA(), instanceId, label: "Ata da aprovação" });

  return transitionGate({ ...actorA(), instanceId, action: "approve" });
}

async function getGate(instanceId: string) {
  const gates = await listProjectGateInstances(orgA.id, projectId, userA.id);
  return gates.find((gate) => gate.id === instanceId)!;
}

describe("BR-002 — aprovação exige critérios e evidências", () => {
  it("reprova aprovação sem critérios e sem evidência", async () => {
    const gates = await listProjectGateInstances(orgA.id, projectId, userA.id);
    const g1 = gates.find((gate) => gate.code === "G1")!;

    await transitionGate({ ...actorA(), instanceId: g1.id, action: "start" });
    await transitionGate({ ...actorA(), instanceId: g1.id, action: "submit" });
    await transitionGate({ ...actorA(), instanceId: g1.id, action: "analyze" });

    const criteriaBlocked = await expectAppError(
      transitionGate({ ...actorA(), instanceId: g1.id, action: "approve" }),
      "GATE_CRITERIA_PENDING"
    );
    expect(criteriaBlocked.status).toBe(409);
  });

  it("dispensa exige justificativa (§17.2) e audita a decisão", async () => {
    const gates = await listProjectGateInstances(orgA.id, projectId, userA.id);
    const g1 = gates.find((gate) => gate.code === "G1")!;

    await expectAppError(
      transitionGate({ ...actorA(), instanceId: g1.id, action: "waive" }),
      "VALIDATION_ERROR"
    );

    const waived = await transitionGate({
      ...actorA(),
      instanceId: g1.id,
      action: "waive",
      reason: "Levantamento já validado em reunião com o cliente.",
    });
    expect(waived.status).toBe("WAIVED");
    expect(waived.decisionReason).toMatch(/reunião/);

    const audit = await listAuditEvents({
      organizationId: orgA.id,
      objectType: "GateInstance",
      objectId: g1.id,
      pageSize: 100,
    });
    const waiveEvent = audit.items.find((item) => item.action === "WAIVE");
    expect(waiveEvent).toBeDefined();

    // G1 dispensado libera a saída de F1 (BR-001 aceita WAIVED).
    const result = await changeProjectPhase({ ...actorA(), projectId, direction: "advance" });
    expect(result.currentPhase).toBe("F2");
  });

  it("rejeição também exige justificativa", async () => {
    const gates = await listProjectGateInstances(orgA.id, projectId, userA.id);
    const g2 = gates.find((gate) => gate.code === "G2")!;

    await transitionGate({ ...actorA(), instanceId: g2.id, action: "start" });
    await transitionGate({ ...actorA(), instanceId: g2.id, action: "submit" });
    await transitionGate({ ...actorA(), instanceId: g2.id, action: "analyze" });

    await expectAppError(
      transitionGate({ ...actorA(), instanceId: g2.id, action: "reject" }),
      "VALIDATION_ERROR"
    );

    const rejected = await transitionGate({
      ...actorA(),
      instanceId: g2.id,
      action: "reject",
      reason: "Estudo de viabilidade incompleto.",
    });
    expect(rejected.status).toBe("REJECTED");
  });

  it("gate decidido não aceita novos critérios nem evidências", async () => {
    const gates = await listProjectGateInstances(orgA.id, projectId, userA.id);
    const g1 = gates.find((gate) => gate.code === "G1")!; // WAIVED

    await expect(
      setGateCriteria({
        ...actorA(),
        instanceId: g1.id,
        results: [{ criterionCode: "C1", completed: true }],
      })
    ).rejects.toThrowError(/decidido/i);

    await expect(
      addGateEvidence({ ...actorA(), instanceId: g1.id, label: "Evidência tardia" })
    ).rejects.toThrowError(/decidido/i);
  });

  it("transições fora da máquina de estados são bloqueadas", async () => {
    const gates = await listProjectGateInstances(orgA.id, projectId, userA.id);
    const g3 = gates.find((gate) => gate.code === "G3")!; // NOT_STARTED

    await expect(
      transitionGate({ ...actorA(), instanceId: g3.id, action: "approve" })
    ).rejects.toThrowError(/Transição inválida/i);
    await expect(
      transitionGate({ ...actorA(), instanceId: g3.id, action: "submit" })
    ).rejects.toThrowError(/Transição inválida/i);
  });
});
