import { describe, expect, it } from "vitest";
import {
  allowedRequirementTransitions,
  buildDrpDocument,
  completeRequirementBlocks,
  g1ApprovalBlocks,
  isRequirementStatus,
  nextRequirementCode,
  regulatoryRequirementBlocks,
  renderDrpMarkdown,
  requirementTransition,
} from "@/modules/requirements/engine";

// Motor puro de requisitos/DRP (E04, §20, BR-008, BR-015, §18-G1).

describe("máquina de estados do requisito (E04-US02)", () => {
  it("fluxos válidos", () => {
    expect(requirementTransition("DRAFT", "ACTIVE")).toBe(true);
    expect(requirementTransition("ACTIVE", "COMPLETED")).toBe(true);
    expect(requirementTransition("COMPLETED", "ACTIVE")).toBe(true);
    expect(requirementTransition("CANCELLED", "DRAFT")).toBe(true);
    expect(requirementTransition("DRAFT", "DRAFT")).toBe(true);
  });

  it("fluxos inválidos", () => {
    expect(requirementTransition("DRAFT", "COMPLETED")).toBe(false);
    expect(requirementTransition("COMPLETED", "CANCELLED")).toBe(false);
    expect(requirementTransition("CANCELLED", "COMPLETED")).toBe(false);
  });

  it("transições permitidas por estado e predicado de status", () => {
    expect(allowedRequirementTransitions("ACTIVE").sort()).toEqual(["CANCELLED", "COMPLETED"]);
    expect(allowedRequirementTransitions("DRAFT")).toEqual(["ACTIVE", "CANCELLED"]);
    expect(isRequirementStatus("ACTIVE")).toBe(true);
    expect(isRequirementStatus("BLOCKED")).toBe(false);
  });
});

describe("BR-008 — conclusão exige critério e evidência", () => {
  const base = { status: "COMPLETED" as const, acceptanceCriteria: "Medido em campo", evidenceCount: 1 };

  it("sem bloco quando critério e evidência existem", () => {
    expect(completeRequirementBlocks(base)).toEqual([]);
  });

  it("bloqueia sem critério de aceite e sem evidência", () => {
    const blocks = completeRequirementBlocks({
      ...base,
      acceptanceCriteria: null,
      evidenceCount: 0,
    });
    expect(blocks).toHaveLength(2);
    expect(blocks.every((block) => block.code === "BR-008")).toBe(true);
    expect(blocks[0].message).toMatch(/critério de aceite/);
  });

  it("só o item pendente é reportado", () => {
    const blocks = completeRequirementBlocks({ ...base, evidenceCount: 0 });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].message).toMatch(/evidência/);
  });
});

describe("BR-015 — requisito regulatório exige fonte e vigência", () => {
  it("não se aplica a categorias não regulatórias", () => {
    expect(regulatoryRequirementBlocks({ category: "OPERATION" })).toEqual([]);
    expect(regulatoryRequirementBlocks({ category: "EQUIPMENT", source: null })).toEqual([]);
  });

  it("categoria COMPLIANCE sem fonte e sem vigência bloqueia", () => {
    const blocks = regulatoryRequirementBlocks({ category: "COMPLIANCE" });
    expect(blocks).toHaveLength(2);
    expect(blocks.every((block) => block.code === "BR-015")).toBe(true);
  });

  it("com fonte e vigência preenchidas passa", () => {
    expect(
      regulatoryRequirementBlocks({
        category: "COMPLIANCE",
        source: "NR-35",
        sourceValidUntil: "2030-12-31",
      })
    ).toEqual([]);
  });
});

describe("numeração automática de código", () => {
  it("primeiro código é REQ-001", () => {
    expect(nextRequirementCode([])).toBe("REQ-001");
    expect(nextRequirementCode(["OBR-9"])).toBe("REQ-001");
  });

  it("sequência contínua ignorando códigos não padrão", () => {
    expect(nextRequirementCode(["REQ-001", "REQ-002", "REQ-010"])).toBe("REQ-011");
  });
});

describe("§18-G1 — checagem de aprovação do gate", () => {
  const base = {
    code: "REQ-001",
    description: "Manutenção das edificações",
    status: "ACTIVE" as const,
    acceptanceCriteria: "Plano aprovado",
    ownerId: "user-1",
  };

  it("DRP vazio é bloqueado", () => {
    const blocks = g1ApprovalBlocks([], 0);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toBe("REQUIREMENTS_INCOMPLETE");
    expect(blocks[0].message).toMatch(/ao menos um requisito/);
  });

  it("sem critério de aceite e sem responsável é bloqueado", () => {
    const blocks = g1ApprovalBlocks(
      [
        { ...base, acceptanceCriteria: null },
        { ...base, code: "REQ-002", ownerId: null },
      ],
      2
    );
    expect(blocks).toHaveLength(2);
    expect(blocks[0].message).toMatch(/critério de aceite/);
    expect(blocks[1].message).toMatch(/responsável/);
  });

  it("sem evidências é bloqueado", () => {
    const blocks = g1ApprovalBlocks([base], 0);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].message).toMatch(/evidências/);
  });

  it("requisitos cancelados não contam para o G1", () => {
    const blocks = g1ApprovalBlocks([{ ...base, status: "CANCELLED" }], 1);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].message).toMatch(/ao menos um requisito/);
  });

  it("DRP completo aprova", () => {
    expect(g1ApprovalBlocks([base], 1)).toEqual([]);
  });
});

describe("DRP (§20 — E04-US05)", () => {
  const project = { code: "PRJ-1", name: "Edifício", currentPhase: "F1" };
  const requirements = [
    {
      code: "REQ-001",
      description: "Acessibilidade nos acessos",
      category: "COMPLIANCE",
      source: "NBR 9050",
      sourceValidUntil: new Date("2030-01-01T00:00:00.000Z"),
      priority: "HIGH",
      ownerName: "Ana",
      acceptanceCriteria: "Laudo emitido",
      requiredEvidence: "Laudo",
      status: "ACTIVE",
      wbsNode: { code: "1.1", name: "Acessos" },
      documentLinks: [{ label: "Norma", url: "https://normas.example/nbr9050" }],
      lastReviewedAt: new Date("2026-01-15T00:00:00.000Z"),
      revision: 3,
    },
    {
      code: "REQ-002",
      description: "Iluminação de emergência",
      category: "OPERATION",
      source: null,
      sourceValidUntil: null,
      priority: "MEDIUM",
      ownerName: null,
      acceptanceCriteria: null,
      requiredEvidence: null,
      status: "DRAFT",
      wbsNode: null,
      documentLinks: [],
      lastReviewedAt: null,
      revision: 1,
    },
  ];

  it("agrega totais por status e categoria", () => {
    const document = buildDrpDocument({
      project,
      requirements,
      generatedBy: "Ana",
      generatedAt: new Date("2026-02-01T12:00:00.000Z"),
    });

    expect(document.title).toMatch(/DRP/);
    expect(document.project).toEqual(project);
    expect(document.generatedAt).toBe("2026-02-01T12:00:00.000Z");
    expect(document.totals).toEqual({
      total: 2,
      byStatus: { ACTIVE: 1, DRAFT: 1 },
      byCategory: { COMPLIANCE: 1, OPERATION: 1 },
    });
  });

  it("renderiza markdown com os campos do requisito", () => {
    const document = buildDrpDocument({ project, requirements, generatedBy: "Ana" });
    const markdown = renderDrpMarkdown(document);

    expect(markdown).toContain("# Documento de Requisitos do Projeto (DRP)");
    expect(markdown).toContain("PRJ-1 — Edifício");
    expect(markdown).toContain("## REQ-001 — Ativo");
    expect(markdown).toContain("**Fonte:** NBR 9050");
    expect(markdown).toContain("**WBS:** 1.1 — Acessos");
    expect(markdown).toContain("**Revisão:** 3");
    expect(markdown).toContain("## REQ-002 — Rascunho");
    expect(markdown).toContain("**Responsável:** —");
  });
});
