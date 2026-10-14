import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { AppError } from "@/core/errors";
import { createOrganization } from "@/modules/identity/services";
import { createClient } from "@/modules/portfolio/clients";
import { createProject } from "@/modules/portfolio/projects";
import { getWbsTree, listWbsVersions, type WbsNodeRow } from "@/modules/wbs/selectors";
import {
  createWbsNode,
  createWbsVersion,
  deleteWbsNode,
  duplicateWbsNode,
  importWbsTree,
  reorderWbsNodes,
  updateWbsNode,
} from "@/modules/wbs/wbs";
import { createRequirement, deleteRequirement } from "@/modules/requirements/requirements";
import { WBS_MAX_DEPTH, buildWbsExport, flattenWbsTree, wbsToCsv } from "@/modules/wbs/engine";

// Árvore de WBS (E05, §74) — CRUD, ciclo/profundidade, reordenação, importação
// com relatório de erros e versionamento no CI.

const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

let orgA: { id: string };
let orgB: { id: string };
let userA: { id: string; email: string };
let userB: { id: string; email: string };
let projectId: string;

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
    data: { email: `wbs-a-${suffix}@test.local`, name: "WBS A", passwordHash },
  });
  userB = await prisma.user.create({
    data: { email: `wbs-b-${suffix}@test.local`, name: "WBS B", passwordHash },
  });

  orgA = await createOrganization({
    name: `Org WBS A ${suffix}`,
    slug: `wbs-a-${suffix}`,
    actorId: userA.id,
    actorEmail: userA.email,
  });
  orgB = await createOrganization({
    name: `Org WBS B ${suffix}`,
    slug: `wbs-b-${suffix}`,
    actorId: userB.id,
    actorEmail: userB.email,
  });

  const client = await createClient({
    ...actorA(),
    code: `CLI-${suffix.toUpperCase()}`,
    name: "Cliente WBS",
  });
  const project = await createProject({
    ...actorA(),
    code: `PRJ-${suffix.toUpperCase()}`,
    name: "Projeto WBS",
    clientId: client.id,
    status: "ACTIVE",
    startDate: "2026-01-01",
  });
  projectId = project.id;
}, 60000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("criação e numeração (E05-US01)", () => {
  it("gera código automático 1, 1.1, 2…", async () => {
    const root = await createWbsNode({ ...actorA(), projectId, name: "Projeto" });
    expect(root.code).toBe("1");

    const child = await createWbsNode({
      ...actorA(),
      projectId,
      name: "Levantamento",
      parentId: root.id,
    });
    expect(child.code).toBe("1.1");

    const secondRoot = await createWbsNode({ ...actorA(), projectId, name: "Operação" });
    expect(secondRoot.code).toBe("2");
  });

  it("código explícito duplicado conflita", async () => {
    await expect(
      createWbsNode({ ...actorA(), projectId, code: "1", name: "Duplicado" })
    ).rejects.toThrowError(/já existe/i);
  });

  it("árvore é montada com caminho, profundidade e contagem de requisitos", async () => {
    const tree = await getWbsTree(orgA.id, projectId);
    expect(tree.map((node) => node.code)).toEqual(["1", "2"]);
    expect(tree[0].path).toBe("1");
    expect(tree[0].children.map((node) => node.code)).toEqual(["1.1"]);
    expect(tree[0].children[0].path).toBe("1.1");
    expect(tree[0].children[0].depth).toBe(1);
    const child = flattenWbsTree(tree).find((node) => node.code === "1.1") as WbsNodeRow;
    expect(child.requirementsCount).toBe(0);
  });
});

describe("movimento, ciclo e profundidade (§74)", () => {
  it("mover nó para descendente é bloqueado", async () => {
    const tree = await getWbsTree(orgA.id, projectId);
    const root = tree.find((node) => node.code === "1")!;

    await expect(
      updateWbsNode({
        ...actorA(),
        nodeId: root.id,
        parentId: root.children[0].id,
      })
    ).rejects.toThrowError(/ciclo|descendente/i);
  });

  it("mover nó para outro pai reordena como último irmão", async () => {
    const tree = await getWbsTree(orgA.id, projectId);
    const secondRoot = tree.find((node) => node.code === "2")!;
    const child = flattenWbsTree(tree).find((node) => node.code === "1.1")!;

    const moved = await updateWbsNode({
      ...actorA(),
      nodeId: child.id,
      parentId: secondRoot.id,
    });
    expect(moved.parentId).toBe(secondRoot.id);
    expect(moved.code).toBe("1.1"); // código não é reescrito no movimento

    const after = flattenWbsTree(await getWbsTree(orgA.id, projectId));
    const childInTree = after.find((node) => node.code === "1.1")!;
    expect(childInTree.parentId).toBe(secondRoot.id);
    expect(childInTree.path).toBe("2.1.1");
  });

  it("profundidade máxima de níveis é respeitada", async () => {
    let parentId: string | null = null;
    for (let level = 0; level < WBS_MAX_DEPTH; level += 1) {
      const node = await createWbsNode({
        ...actorA(),
        projectId,
        name: `Nível ${level}`,
        parentId,
      });
      parentId = node.id;
    }

    const error = await expectAppError(
      createWbsNode({ ...actorA(), projectId, name: "Demais", parentId: parentId! }),
      "VALIDATION_ERROR"
    );
    expect(error.message).toMatch(/Profundidade máxima/);
  });
});

describe("exclusão (E05-US01)", () => {
  it("bloqueia exclusão com filhos e com requisitos vinculados", async () => {
    const parent = await createWbsNode({ ...actorA(), projectId, name: "Pai protegido" });
    const leaf = await createWbsNode({
      ...actorA(),
      projectId,
      name: "Folha protegida",
      parentId: parent.id,
    });

    await expectAppError(deleteWbsNode({ ...actorA(), nodeId: parent.id }), "CONFLICT");

    const requirement = await createRequirement({
      ...actorA(),
      projectId,
      description: "Requisito rastreado na WBS",
      wbsNodeId: leaf.id,
    });

    const blocked = await expectAppError(
      deleteWbsNode({ ...actorA(), nodeId: leaf.id }),
      "CONFLICT"
    );
    expect(blocked.message).toMatch(/requisito/i);

    await deleteRequirement({ ...actorA(), requirementId: requirement.id });
    const deleted = await deleteWbsNode({ ...actorA(), nodeId: leaf.id });
    expect(deleted.nodeId).toBe(leaf.id);

    const after = await getWbsTree(orgA.id, projectId);
    expect(flattenWbsTree(after).find((node) => node.id === leaf.id)).toBeUndefined();
  });
});

describe("reordenação (E05-US02)", () => {
  it("troca a ordem entre irmãos", async () => {
    const tree = await getWbsTree(orgA.id, projectId);
    const roots = tree.map((node) => node.id);
    const reversed = [...roots].reverse();

    const result = await reorderWbsNodes({
      ...actorA(),
      projectId,
      parentId: null,
      orderedIds: reversed,
    });
    expect(result.orderedIds).toEqual(reversed);

    const after = await getWbsTree(orgA.id, projectId);
    expect(after.map((node) => node.id)).toEqual(reversed);
  });

  it("lista fora do conjunto de irmãos é rejeitada", async () => {
    const tree = await getWbsTree(orgA.id, projectId);
    await expect(
      reorderWbsNodes({
        ...actorA(),
        projectId,
        parentId: null,
        orderedIds: [tree[0].id],
      })
    ).rejects.toThrowError(/exatamente os nós irmãos/);
  });
});

describe("duplicação de subárvore (§74)", () => {
  it("duplica nó e descendentes com códigos novos", async () => {
    const root = await createWbsNode({ ...actorA(), projectId, name: "Pacote" });
    const child = await createWbsNode({
      ...actorA(),
      projectId,
      name: "Subpacote",
      parentId: root.id,
    });

    const result = await duplicateWbsNode({ ...actorA(), nodeId: child.id });
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].code).not.toBe(child.code);
    expect(result.nodes[0].parentId).toBe(root.id);
  });
});

describe("versionamento (E05-US05)", () => {
  it("snapshot manual incrementa a versão", async () => {
    const first = await createWbsVersion({ ...actorA(), projectId, note: "Baseline" });
    expect(first.version).toBe(1);

    const second = await createWbsVersion({ ...actorA(), projectId });
    expect(second.version).toBe(2);

    const versions = await listWbsVersions(orgA.id, projectId);
    expect(versions.map((version) => version.version)).toEqual([2, 1]);
    expect(versions[1].note).toBe("Baseline");
    expect(versions[1].nodeCount).toBeGreaterThan(0);
  });
});

describe("importação (E05-US03, §0.1 regra 18)", () => {
  it("reporta erros de validação com detalhes por linha", async () => {
    const duplicated = await expectAppError(
      importWbsTree({
        ...actorA(),
        projectId,
        nodes: [
          { code: "1", name: "Projeto" },
          { code: "1", name: "Duplicado no payload" },
        ],
      }),
      "VALIDATION_ERROR"
    );
    expect((duplicated.details as { errors: string[] }).errors.join(" ")).toMatch(
      /duplicado/i
    );

    const orphan = await expectAppError(
      importWbsTree({
        ...actorA(),
        projectId,
        nodes: [{ code: "3", name: "Órfão", parentCode: "inexistente" }],
      }),
      "VALIDATION_ERROR"
    );
    expect((orphan.details as { errors: string[] }).errors.join(" ")).toMatch(
      /não existe/
    );
  });

  it("faz merge por código, preserva payload e gera versão IMPORT", async () => {
    const before = await getWbsTree(orgA.id, projectId);
    const beforeCount = flattenWbsTree(before).length;

    const summary = await importWbsTree({
      ...actorA(),
      projectId,
      note: "Importação do MS Project",
      nodes: [
        { code: "1", name: "Projeto (importado)", parentCode: null },
        { code: "90", name: "Nova área", parentCode: null },
        { code: "90.1", name: "Etapa nova", parentCode: "90" },
      ],
    });

    expect(summary.createdCount).toBe(2);
    expect(summary.updatedCount).toBe(1);
    expect(summary.resurrectedCount).toBe(0);
    expect(summary.version).toBe(3);

    const after = await getWbsTree(orgA.id, projectId);
    const root = after.find((node) => node.code === "1")!;
    expect(root.name).toBe("Projeto (importado)");
    // nós existentes fora do payload permanecem intactos
    const afterCodes = flattenWbsTree(after).map((node) => node.code);
    for (const code of flattenWbsTree(before).map((node) => node.code)) {
      expect(afterCodes).toContain(code);
    }
    const imported = after.find((node) => node.code === "90")!;
    expect(imported.children.map((node) => node.code)).toEqual(["90.1"]);

    const versions = await listWbsVersions(orgA.id, projectId);
    const importVersion = versions.find((version) => version.version === 3)!;
    expect(importVersion.source).toBe("IMPORT");
    expect(importVersion.note).toBe("Importação do MS Project");
    expect(importVersion.hasRawPayload).toBe(true);
    expect(importVersion.nodeCount).toBe(beforeCount);
  });

  it("exporta a árvore atual em documento e CSV", async () => {
    const tree = await getWbsTree(orgA.id, projectId);
    const project = { code: `PRJ-${suffix.toUpperCase()}`, name: "Projeto WBS" };
    const document = buildWbsExport(tree, project, new Date("2026-02-01T00:00:00.000Z"));
    const total = flattenWbsTree(tree).length;

    expect(document.format).toBe("micI.wbs/1");
    expect(document.nodes.length).toBe(total);
    expect(document.nodes.every((item) => typeof item.path === "string")).toBe(true);

    const csv = wbsToCsv(tree);
    expect(csv.split("\n")).toHaveLength(total + 1);
  });
});

describe("isolamento de tenant — WBS", () => {
  it("árvore de outro tenant é NOT_FOUND", async () => {
    await expectAppError(getWbsTree(orgB.id, projectId), "NOT_FOUND");
  });

  it("criação em projeto de outro tenant é NOT_FOUND", async () => {
    await expectAppError(
      createWbsNode({ ...actorA(), organizationId: orgB.id, projectId, name: "Invasor" }),
      "NOT_FOUND"
    );
  });
});
