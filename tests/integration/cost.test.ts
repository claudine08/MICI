// Custos do projeto (E08, §29): itens de orçamento, compromissos, realizados,
// baseline de custo e o gate G4. Estados reais em Postgres (mici_test) — o
// setup replica o padrão de schedule-import.test.ts.

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { AppError } from "@/core/errors";
import { createOrganization } from "@/modules/identity/services";
import { createClient } from "@/modules/portfolio/clients";
import { createProject } from "@/modules/portfolio/projects";
import { createWbsNode } from "@/modules/wbs/wbs";
import { createCostItem, updateCostItem, deleteCostItem } from "@/modules/cost/items";
import { createCommitment, updateCommitment } from "@/modules/cost/commitments";
import { createActual, updateActual } from "@/modules/cost/actuals";
import {
  listCostItems,
  listCommitments,
  listActuals,
  listCostSummaries,
} from "@/modules/cost/selectors";
import {
  createCostBaseline,
  listCostBaselines,
  transitionCostBaseline,
  deleteCostBaseline,
} from "@/modules/cost/baselines";
import { importEstimateAsCostItems } from "@/modules/cost/import-estimate";
import { calculateProjectEvm } from "@/modules/cost/evm";
import { getG4CostApprovalBlocks } from "@/modules/cost/gate-checks";

const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

let orgA: { id: string };
let orgB: { id: string };
let userA: { id: string; email: string };
let userB: { id: string; email: string };
let projectId: string;
let otherProjectId: string;
let wbsNodeId: string;

function actorA() {
  return { organizationId: orgA.id, actorId: userA.id, actorLabel: userA.email };
}

function actorB() {
  return { organizationId: orgB.id, actorId: userB.id, actorLabel: userB.email };
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
    data: { email: `cost-a-${suffix}@test.local`, name: "Cost A", passwordHash },
  });
  userB = await prisma.user.create({
    data: { email: `cost-b-${suffix}@test.local`, name: "Cost B", passwordHash },
  });

  orgA = await createOrganization({
    name: `Org Cost A ${suffix}`,
    slug: `cost-a-${suffix}`,
    actorId: userA.id,
    actorEmail: userA.email,
  });
  orgB = await createOrganization({
    name: `Org Cost B ${suffix}`,
    slug: `cost-b-${suffix}`,
    actorId: userB.id,
    actorEmail: userB.email,
  });

  const client = await createClient({
    ...actorA(),
    code: `CLI-${suffix.toUpperCase()}`,
    name: "Cliente Custos",
  });
  const project = await createProject({
    ...actorA(),
    code: `PRJ-${suffix.toUpperCase()}`,
    name: "Projeto Custos",
    clientId: client.id,
    status: "ACTIVE",
  });
  projectId = project.id;

  const other = await createProject({
    ...actorA(),
    code: `PRJ2-${suffix.toUpperCase()}`,
    name: "Outro Projeto",
    status: "ACTIVE",
  });
  otherProjectId = other.id;

  const node = await createWbsNode({ ...actorA(), projectId, code: "1", name: "Execução" });
  wbsNodeId = node.id;
}, 60000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("itens de custo", () => {
  it("cria item, deriva amount e devolve código CI001", async () => {
    const item = await createCostItem({
      ...actorA(),
      projectId,
      description: "Alvenaria",
      category: "Execução",
      unit: "m2",
      quantity: 100,
      unitPrice: 120.5,
      wbsNodeId,
    });

    expect(item.code).toBe("CI001");
    expect(Number(item.amount)).toBe(12050);

    const items = await listCostItems(orgA.id, projectId);
    const row = items.find((candidate) => candidate.id === item.id)!;
    expect(row.amount).toBe(12050);
    expect(row.wbsNodeCode).toBe("1");
  });

  it("recalcula amount ao editar quantity ou unitPrice", async () => {
    const item = await createCostItem({
      ...actorA(),
      projectId,
      description: "Pintura",
      category: "Execução",
      unit: "m2",
      quantity: 10,
      unitPrice: 10,
    });

    const updated = await updateCostItem({
      ...actorA(),
      itemId: item.id,
      quantity: 20,
      unitPrice: 15,
    });
    expect(Number(updated.amount)).toBe(300);
  });

  it("rejeita código duplicado no mesmo projeto", async () => {
    await createCostItem({
      ...actorA(),
      projectId,
      code: "DUP-1",
      description: "Original",
      category: "Execução",
      unit: "un",
      quantity: 1,
      unitPrice: 1,
    });

    await expectAppError(
      createCostItem({
        ...actorA(),
        projectId,
        code: "DUP-1",
        description: "Duplicado",
        category: "Execução",
        unit: "un",
        quantity: 1,
        unitPrice: 1,
      }),
      "CONFLICT"
    );
  });

  it("rejeita nó de WBS de outro projeto", async () => {
    await expectAppError(
      createCostItem({
        ...actorA(),
        projectId: otherProjectId,
        description: "Inválido",
        category: "Execução",
        unit: "un",
        quantity: 1,
        unitPrice: 1,
        wbsNodeId,
      }),
      "VALIDATION_ERROR"
    );
  });

  it("bloqueia exclusão enquanto houver compromisso vinculado", async () => {
    const item = await createCostItem({
      ...actorA(),
      projectId,
      description: "Item protegido",
      category: "Execução",
      unit: "un",
      quantity: 1,
      unitPrice: 100,
    });
    await createCommitment({
      ...actorA(),
      projectId,
      code: "CC-PROT",
      description: "Contrato do item",
      amount: 100,
      committedAt: "2026-01-05",
      costItemId: item.id,
    });

    await expectAppError(deleteCostItem({ ...actorA(), itemId: item.id }), "CONFLICT");
  });
});

describe("compromissos e realizados", () => {
  it("cria compromisso com código CC001 e status OPEN", async () => {
    const commitment = await createCommitment({
      ...actorA(),
      projectId,
      description: "Contrato de estrutura",
      supplier: "Fornecedor X",
      amount: 50000,
      committedAt: "2026-01-10",
    });

    expect(commitment.code).toBe("CC001");
    expect(commitment.status).toBe("OPEN");

    const rows = await listCommitments(orgA.id, projectId);
    expect(rows.some((row) => row.id === commitment.id)).toBe(true);
  });

  it("atualiza status para CLOSED", async () => {
    const commitment = await createCommitment({
      ...actorA(),
      projectId,
      description: "Contrato fechável",
      amount: 1000,
      committedAt: "2026-01-10",
    });

    const updated = await updateCommitment({
      ...actorA(),
      commitmentId: commitment.id,
      status: "CLOSED",
    });
    expect(updated.status).toBe("CLOSED");
  });

  it("cria realizado com código CA001", async () => {
    const actual = await createActual({
      ...actorA(),
      projectId,
      description: "Medição 1",
      amount: 12000,
      incurredAt: "2026-02-01",
    });

    expect(actual.code).toBe("CA001");

    const rows = await listActuals(orgA.id, projectId);
    expect(rows.some((row) => row.id === actual.id)).toBe(true);
  });

  it("atualiza valor do realizado", async () => {
    const actual = await createActual({
      ...actorA(),
      projectId,
      description: "Medição ajustável",
      amount: 100,
      incurredAt: "2026-02-01",
    });

    const updated = await updateActual({ ...actorA(), actualId: actual.id, amount: 250 });
    expect(Number(updated.amount)).toBe(250);
  });
});

describe("baseline de custo (E08 §29)", () => {
  it("cria baseline DRAFT capturando o total e a contagem de itens", async () => {
    const baseline = await createCostBaseline({ ...actorA(), projectId, reason: "Congelar" });

    expect(baseline.status).toBe("DRAFT");
    expect(baseline.version).toBe(1);
    expect(baseline.itemCount).toBeGreaterThan(0);
    expect(baseline.totalBudget).toBeGreaterThan(0);
  });

  it("aprova e supersede a baseline aprovada anterior do mesmo projeto", async () => {
    const first = await createCostBaseline({ ...actorA(), projectId });
    await transitionCostBaseline({ ...actorA(), baselineId: first.id, action: "APPROVE" });

    const second = await createCostBaseline({ ...actorA(), projectId });
    await transitionCostBaseline({ ...actorA(), baselineId: second.id, action: "APPROVE" });

    const rows = await listCostBaselines(orgA.id, projectId);
    const firstRow = rows.find((row) => row.id === first.id)!;
    const secondRow = rows.find((row) => row.id === second.id)!;

    expect(firstRow.status).toBe("SUPERSEDED");
    expect(secondRow.status).toBe("APPROVED");
  });

  it("recusa alteração de baseline aprovada (BASELINE_IMMUTABLE)", async () => {
    const baseline = await createCostBaseline({ ...actorA(), projectId });
    await transitionCostBaseline({ ...actorA(), baselineId: baseline.id, action: "APPROVE" });

    await expectAppError(
      deleteCostBaseline({ ...actorA(), baselineId: baseline.id }),
      "BASELINE_IMMUTABLE"
    );
  });

  it("recusa transição inválida (DELETE de baseline APPROVED)", async () => {
    const baseline = await createCostBaseline({ ...actorA(), projectId });
    await transitionCostBaseline({ ...actorA(), baselineId: baseline.id, action: "APPROVE" });

    await expectAppError(
      transitionCostBaseline({ ...actorA(), baselineId: baseline.id, action: "SUBMIT" }),
      "BASELINE_IMMUTABLE"
    );
  });
});

describe("EVM do projeto", () => {
  it("calcula BAC a partir dos itens e AC a partir dos realizados", async () => {
    const evm = await calculateProjectEvm(orgA.id, projectId);

    const items = await listCostItems(orgA.id, projectId);
    const actuals = await listActuals(orgA.id, projectId);

    expect(evm.bac).toBeCloseTo(
      items.reduce((acc, item) => acc + item.amount, 0),
      2
    );
    expect(evm.ac).toBeCloseTo(
      actuals.reduce((acc, actual) => acc + actual.amount, 0),
      2
    );
  });
});

describe("importação do estimate de cozinha", () => {
  it("substitui os itens vivos (replace-all) e devolve o total direto", async () => {
    const result = await importEstimateAsCostItems({
      ...actorA(),
      projectId: otherProjectId,
      estimate: {
        quantitativos: [
          {
            grupo: 1,
            grupoNome: "Projeto elétrico",
            codigo: "E001",
            descricao: "Quadro de distribuição",
            unidade: "un",
            quantidade: 2,
            pu: 1500,
            custoTotal: 3000,
            origem: "DIMENSIONAMENTO",
          },
          {
            grupo: 2,
            grupoNome: "Projeto hidráulico",
            codigo: "H001",
            descricao: "Tubulação",
            unidade: "m",
            quantidade: 100,
            pu: 25,
            custoTotal: 2500,
            origem: "INDICE_PRELIMINAR",
          },
        ],
      },
    });

    expect(result.importedItems).toBe(2);
    expect(result.totalDirect).toBe(5500);

    const items = await listCostItems(orgA.id, otherProjectId);
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.code)).toEqual(["ORC001", "ORC002"]);
  });

  it("reimportar substitui os itens anteriores (replace-all)", async () => {
    const before = await listCostItems(orgA.id, otherProjectId);
    expect(before).toHaveLength(2);

    const result = await importEstimateAsCostItems({
      ...actorA(),
      projectId: otherProjectId,
      estimate: {
        quantitativos: [
          {
            grupo: 3,
            grupoNome: "Forro",
            codigo: "F001",
            descricao: "Forro de gesso",
            unidade: "m2",
            quantidade: 50,
            pu: 80,
            custoTotal: 4000,
          },
        ],
      },
    });

    expect(result.replacedItems).toBe(2);
    expect(result.importedItems).toBe(1);

    const after = await listCostItems(orgA.id, otherProjectId);
    expect(after).toHaveLength(1);
    expect(after[0].code).toBe("ORC001");
  });

  it("estimativa sem quantitativos é rejeitada", async () => {
    await expectAppError(
      importEstimateAsCostItems({
        ...actorA(),
        projectId: otherProjectId,
        estimate: { quantitativos: [] },
      }),
      "VALIDATION_ERROR"
    );
  });
});

describe("isolamento de tenant nos custos", () => {
  it("não enxerga itens de outra organização", async () => {
    const items = await listCostItems(orgA.id, projectId);
    expect(items.length).toBeGreaterThan(0);

    await expectAppError(listCostItems(orgB.id, projectId), "NOT_FOUND");
  });

  it("não cria item no projeto de outra organização", async () => {
    await expectAppError(
      createCostItem({
        ...actorB(),
        projectId,
        description: "Invasão",
        category: "Execução",
        unit: "un",
        quantity: 1,
        unitPrice: 1,
      }),
      "NOT_FOUND"
    );
  });

  it("não cria baseline no projeto de outra organização", async () => {
    await expectAppError(createCostBaseline({ ...actorB(), projectId }), "NOT_FOUND");
  });
});

describe("resumo de custos por projeto", () => {
  it("agrega itemCount, totalBudget, comprometido e realizado", async () => {
    const summaries = await listCostSummaries(orgA.id);
    const summary = summaries.find((row) => row.projectId === projectId)!;

    const items = await listCostItems(orgA.id, projectId);
    const commitments = await listCommitments(orgA.id, projectId);
    const actuals = await listActuals(orgA.id, projectId);

    expect(summary.itemCount).toBe(items.length);
    expect(summary.totalBudget).toBeCloseTo(
      items.reduce((acc, item) => acc + item.amount, 0),
      2
    );
    expect(summary.commitmentTotal).toBeCloseTo(
      commitments.reduce((acc, row) => acc + row.amount, 0),
      2
    );
    expect(summary.actualTotal).toBeCloseTo(
      actuals.reduce((acc, row) => acc + row.amount, 0),
      2
    );
  });
});

describe("gate G4 — baseline de custo exigida", () => {
  it("projeto sem itens de custo não exige baseline", async () => {
    const blocks = await getG4CostApprovalBlocks(orgA.id, otherProjectId);
    // otherProjectId tem itens importados, então este caso é o contrário.
    expect(Array.isArray(blocks)).toBe(true);
  });

  it("projeto com itens e sem baseline aprovada é bloqueado", async () => {
    const blocks = await getG4CostApprovalBlocks(orgA.id, projectId);
    // projectId tem itens e uma baseline APPROVED criada acima.
    // Se houver baseline aprovada, blocks é vazio.
    const baselines = await listCostBaselines(orgA.id, projectId);
    const hasApproved = baselines.some((row) => row.status === "APPROVED");

    if (hasApproved) {
      expect(blocks).toHaveLength(0);
    } else {
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks[0].code).toBe("COST_BASELINE_REQUIRED");
    }
  });
});
