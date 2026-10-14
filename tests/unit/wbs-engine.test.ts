import { describe, expect, it } from "vitest";
import {
  WBS_MAX_DEPTH,
  buildWbsExport,
  buildWbsTree,
  descendantIds,
  flattenWbsTree,
  nextWbsCode,
  nodeDepth,
  nodeDepthIfMoved,
  planReorder,
  validateWbsImport,
  wbsToCsv,
  wouldCreateCycle,
  type WbsImportNode,
  type WbsNodeLite,
} from "@/modules/wbs/engine";

// Motor puro da árvore de WBS (E05, §74) — sem I/O.

const now = new Date("2026-01-01T00:00:00.000Z");

function node(
  id: string,
  code: string,
  parentId: string | null = null,
  orderIndex = 0,
  extra: Partial<WbsNodeLite> = {}
): WbsNodeLite {
  return { id, parentId, code, name: `Nó ${code}`, orderIndex, ...extra };
}

// 1 (raiz) └─ 1.1 └─ 1.1.1
//          └─ 1.2
// 2 (raiz)
const nodes: WbsNodeLite[] = [
  node("a", "1", null, 0),
  node("b", "1.1", "a", 0),
  node("c", "1.1.1", "b", 0),
  node("d", "1.2", "a", 1),
  node("e", "2", null, 1),
];

describe("montagem da árvore (E05-US01)", () => {
  it("ordena irmãos e calcula caminho/profundidade", () => {
    const roots = buildWbsTree(nodes);
    expect(roots.map((root) => root.code)).toEqual(["1", "2"]);

    const first = roots[0];
    expect(first.path).toBe("1");
    expect(first.depth).toBe(0);
    expect(first.children.map((child) => child.code)).toEqual(["1.1", "1.2"]);
    expect(first.children[0].path).toBe("1.1");
    expect(first.children[0].children[0].path).toBe("1.1.1");
    expect(first.children[0].children[0].depth).toBe(2);

    expect(flattenWbsTree(roots).map((item) => item.code)).toEqual([
      "1",
      "1.1",
      "1.1.1",
      "1.2",
      "2",
    ]);
  });

  it("nó apagado não aparece e órfão vira raiz (nunca perde dados)", () => {
    const withDeleted = [...nodes, node("x", "9", null, 2, { deletedAt: now })];
    const roots = buildWbsTree(withDeleted);
    expect(roots.map((root) => root.code)).toEqual(["1", "2"]);

    const orphaned = buildWbsTree([node("o", "5", "inexistente", 0)]);
    expect(orphaned).toHaveLength(1);
    expect(orphaned[0].parentId).toBeNull();
    expect(orphaned[0].depth).toBe(0);
  });
});

describe("profundidade e ciclos (§74)", () => {
  it("profundidade medida a partir da raiz", () => {
    expect(nodeDepth("a", nodes)).toBe(0);
    expect(nodeDepth("b", nodes)).toBe(1);
    expect(nodeDepth("c", nodes)).toBe(2);
  });

  it("descendentes incluem gerações seguintes", () => {
    expect(descendantIds("a", nodes).sort()).toEqual(["b", "c", "d"]);
    expect(descendantIds("c", nodes)).toEqual([]);
  });

  it("movimento para descendente ou para si mesmo é ciclo", () => {
    expect(wouldCreateCycle("a", "c", nodes)).toBe(true);
    expect(wouldCreateCycle("a", "a", nodes)).toBe(true);
    expect(wouldCreateCycle("a", "e", nodes)).toBe(false);
    expect(wouldCreateCycle("a", null, nodes)).toBe(false);
  });

  it("profundidade resultante do movimento respeita a subárvore", () => {
    // mover 1 (subárvore até 2 níveis) para dentro de 2 → nova profundidade 3
    expect(nodeDepthIfMoved("a", "e", nodes)).toBe(3);
    // mover para a raiz mantém 2 como nível máximo da subárvore
    expect(nodeDepthIfMoved("c", null, nodes)).toBe(0);
  });
});

describe("numeração de códigos (E05-US01)", () => {
  it("raízes numeradas 1, 2, 3… e filhos 1.1, 1.2…", () => {
    expect(nextWbsCode(nodes, null)).toBe("3");
    expect(nextWbsCode(nodes, "a")).toBe("1.3");
    expect(nextWbsCode([], null)).toBe("1");
  });

  it("nunca reutiliza código de nó apagado (índice único por projeto)", () => {
    const withDeleted = [
      node("a", "1"),
      node("b", "2", null, 1),
      node("gone", "3", null, 2, { deletedAt: now }),
    ];
    expect(nextWbsCode(withDeleted, null)).toBe("4");
  });
});

describe("reordenação (E05-US02)", () => {
  it("plana nova ordem entre irmãos", () => {
    const plan = planReorder(nodes, null, ["e", "a"]);
    expect(plan).toEqual({
      ok: true,
      updates: [
        { id: "e", orderIndex: 0 },
        { id: "a", orderIndex: 1 },
      ],
    });
  });

  it("rejeita lista que não corresponde aos irmãos", () => {
    const wrong = planReorder(nodes, null, ["a"]);
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error).toMatch(/exatamente os nós irmãos/);

    const duplicated = planReorder(nodes, null, ["a", "a"]);
    expect(duplicated.ok).toBe(false);
    if (!duplicated.ok) expect(duplicated.error).toMatch(/repetido/);

    const badParent = planReorder(nodes, "inexistente", ["a"]);
    expect(badParent.ok).toBe(false);
    if (!badParent.ok) expect(badParent.error).toMatch(/Pai inválido/);
  });
});

describe("importação (E05-US03, §0.1 regra 18)", () => {
  const payload: WbsImportNode[] = [
    { code: "1", name: "Projeto", parentCode: null },
    { code: "1.1", name: "Levantamento", parentCode: "1" },
  ];

  it("payload vazio é erro", () => {
    const result = validateWbsImport([], []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/vazio/);
  });

  it("reporta código duplicado e nome ausente", () => {
    const result = validateWbsImport([], [
      { code: "1", name: "A" },
      { code: "1", name: "B" },
      { code: "2", name: " " },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("duplicado"))).toBe(true);
      expect(result.errors.some((error) => error.includes("nome ausente"))).toBe(true);
    }
  });

  it("reporta pai inexistente, pai si mesmo e pai apagado", () => {
    const missing = validateWbsImport([], [{ code: "1", name: "A", parentCode: "zz" }]);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors[0]).toMatch(/não existe/);

    const self = validateWbsImport([], [{ code: "1", name: "A", parentCode: "1" }]);
    expect(self.ok).toBe(false);
    if (!self.ok) expect(self.errors[0]).toMatch(/pai de si mesmo/);

    const deletedParent = validateWbsImport(
      [node("p", "9", null, 0, { deletedAt: now })],
      [{ code: "1", name: "A", parentCode: "9" }]
    );
    expect(deletedParent.ok).toBe(false);
    if (!deletedParent.ok) expect(deletedParent.errors[0]).toMatch(/apagado/);
  });

  it("detecta ciclo entre nós do payload", () => {
    const result = validateWbsImport([], [
      { code: "1", name: "A", parentCode: "2" },
      { code: "2", name: "B", parentCode: "1" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((error) => error.includes("ciclo"))).toBe(true);
  });

  it("código novo é anexado ao fim dos irmãos", () => {
    const result = validateWbsImport([], payload);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const child = result.plan.upserts.find((upsert) => upsert.code === "1.1");
      expect(child?.existingId).toBeNull();
      expect(child?.orderIndex).toBe(0);
      expect(child?.nodeType).toBe("SUMMARY");
    }
  });

  it("reaproveita id existente e ressuscita nó apagado", () => {
    const existing = [node("a", "1", null, 0), node("gone", "1.1", "a", 1, { deletedAt: now })];
    const result = validateWbsImport(existing, [
      { code: "1", name: "Projeto" },
      { code: "1.1", name: "Levantamento", parentCode: "1" },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const resurrect = result.plan.upserts.find((upsert) => upsert.code === "1.1");
      expect(resurrect?.existingId).toBe("gone");
      expect(resurrect?.resurrect).toBe(true);
      const kept = result.plan.upserts.find((upsert) => upsert.code === "1");
      expect(kept?.resurrect).toBe(false);
      // nós fora do payload permanecem intactos
      expect(result.plan.finalNodes.map((item) => item.id).sort()).toEqual(["a", "gone"]);
    }
  });

  it("parentCode omitido preserva o pai atual", () => {
    const existing = [node("a", "1", null, 0), node("b", "1.1", "a", 0)];
    const result = validateWbsImport(existing, [{ code: "1.1", name: "Renomeado" }]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const child = result.plan.finalNodes.find((item) => item.id === "b");
      expect(child?.parentId).toBe("a");
    }
  });

  it("reporta profundidade máxima excedida", () => {
    const chain: WbsNodeLite[] = [];
    let parentId: string | null = null;
    // profundidades 0..MAX-1 (árvore válida); o filho novo cruza o limite
    for (let level = 0; level < WBS_MAX_DEPTH; level += 1) {
      const id = `n${level}`;
      chain.push(node(id, level === 0 ? "1" : `1.${level}`, parentId, level));
      parentId = id;
    }
    const deepest = `1.${WBS_MAX_DEPTH - 1}`;
    const result = validateWbsImport(chain, [
      { code: `1.${WBS_MAX_DEPTH}`, name: "Fundamental", parentCode: deepest },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/profundidade máxima/);
  });
});

describe("exportação (E05-US04)", () => {
  it("gera documento com caminhos e nós", () => {
    const document = buildWbsExport(buildWbsTree(nodes), {
      code: "PRJ-1",
      name: "Edifício",
    });
    expect(document.format).toBe("micI.wbs/1");
    expect(document.project).toEqual({ code: "PRJ-1", name: "Edifício" });
    expect(document.nodes).toHaveLength(5);
    expect(document.nodes.map((item) => item.path)).toEqual([
      "1",
      "1.1",
      "1.1.1",
      "1.2",
      "2",
    ]);
    expect(document.nodes[2]).toMatchObject({
      code: "1.1.1",
      parentCode: "1.1",
      nodeType: "WORK_PACKAGE",
    });
  });

  it("renderiza CSV com escape de aspas", () => {
    const withComma = [...nodes, node("f", "3", null, 2, { name: 'Obra, "grande"' })];
    const csv = wbsToCsv(buildWbsTree(withComma));
    const lines = csv.split("\n");
    expect(lines[0]).toBe("path;code;name;type;depth;order");
    expect(lines).toHaveLength(7);
    expect(lines[6]).toBe('3;3;"Obra, ""grande""";WORK_PACKAGE;0;2');
  });
});
