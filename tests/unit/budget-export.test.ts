// Testes da exportação JSON/CSV (entrada da fase de orçamentação, E08).

import { describe, expect, it } from "vitest";
import { defaultAmbientes, defaultTabelaPrecos, defaultUsosAgua } from "@/modules/budget/defaults";
import { estimateKitchenBudget } from "@/modules/budget/engine";
import {
  budgetFileName,
  buildBudgetCsv,
  buildBudgetJson,
} from "@/modules/budget/export";
import { estimateRequestSchema } from "@/modules/budget/schemas";

function sampleEstimate() {
  return estimateKitchenBudget(
    estimateRequestSchema.parse({
      premissas: { municipio: "São José dos Campos", uf: "SP", fatorCustoLocal: 1.25 },
      cardapio: [
        {
          codigo: "P1",
          nome: "Arroz",
          porcaoProntaG: 150,
          quantidadeRefeicoes: 2000,
          fatorRendimento: 1,
          grupo: "PRAATO_FUNDAMENTO",
        },
      ],
      equipamentos: [
        {
          codigo: "COC-1",
          familia: "COCCAO",
          descricao: 'Equipamento com "aspas" e ; ponto e vírgula',
          capacidadeUtil: 50,
          unidadeCapacidade: "KG",
          cicloMin: 45,
          potenciaKW: 20,
          consumoGasKW: 20,
          precoUnitario: 10000,
        },
      ],
      ambientes: defaultAmbientes(),
      usosAgua: defaultUsosAgua(),
      tabelaPrecos: defaultTabelaPrecos(),
    })
  );
}

describe("budget-export — JSON", () => {
  it("gera JSON válido com versão do schema e consolidação", () => {
    const estimate = sampleEstimate();
    const parsed = JSON.parse(buildBudgetJson(estimate));
    expect(parsed.schemaVersion).toBe("1.0.0");
    expect(parsed.premissas.capacidadeDiaria).toBe(2000);
    expect(parsed.consolidacao.totalGeral).toBeGreaterThan(0);
    expect(Array.isArray(parsed.quantitativos)).toBe(true);
    expect(Array.isArray(parsed.avisos)).toBe(true);
  });
});

describe("budget-export — CSV", () => {
  it("contém as seções premissas, dimensionamento, quantitativos, consolidação e avisos", () => {
    const csv = buildBudgetCsv(sampleEstimate());
    expect(csv).toContain("SEÇÃO;CAMPO;VALOR");
    expect(csv).toContain("PREMISSAS;capacidade diária (refeições);2000,00");
    expect(csv).toContain("DIMENSIONAMENTO;refeições/hora na distribuição");
    expect(csv).toContain("GRUPO;GRUPO_NOME;CODIGO;DESCRICAO;UNIDADE;QUANTIDADE;PU;CUSTO_TOTAL;ORIGEM;FONTE_PRECO;DATA_BASE");
    expect(csv).toContain("ETAPA;VALOR");
    expect(csv).toContain("TOTAL GERAL");
    expect(csv).toContain("AVISOS");
  });

  it("usa separador ponto e vírgula e vírgua decimal (pt-BR)", () => {
    const csv = buildBudgetCsv(sampleEstimate());
    expect(csv).toContain("fator de custo local;1,25");
  });

  it("escapa aspas e ponto e vírgula nos textos", () => {
    const csv = buildBudgetCsv(sampleEstimate());
    expect(csv).toContain('"Equipamento com ""aspas"" e ; ponto e vírgula"');
  });
});

describe("budget-export — nome do arquivo", () => {
  it("inclui capacidade e data-base no nome", () => {
    const estimate = sampleEstimate();
    expect(budgetFileName(estimate, "json")).toBe("orcamento-cozinha-2000-ref-2026-10.json");
    expect(budgetFileName(estimate, "csv")).toBe("orcamento-cozinha-2000-ref-2026-10.csv");
  });
});
