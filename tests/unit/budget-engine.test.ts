// Testes do cálculo puro de orçamento de cozinha industrial (memoria_calculo).

import { describe, expect, it } from "vitest";
import { defaultAmbientes, defaultTabelaPrecos, defaultUsosAgua } from "@/modules/budget/defaults";
import { estimateKitchenBudget } from "@/modules/budget/engine";
import {
  cardapioSchema,
  equipamentoSchema,
  estimateRequestSchema,
  premissasSchema,
  type Equipamento,
  type Preparacao,
} from "@/modules/budget/schemas";

function prep(overrides: Partial<Preparacao> & Pick<Preparacao, "codigo" | "nome">): Preparacao {
  return {
    porcaoProntaG: 150,
    quantidadeRefeicoes: 2000,
    fatorRendimento: 1,
    grupo: "PRAATO_FUNDAMENTO",
    ...overrides,
  };
}

function coccao(overrides: Partial<Equipamento> = {}): Equipamento {
  return equipamentoSchema.parse({
    codigo: "COC-TEST",
    familia: "COCCAO",
    descricao: "Caldeirão de teste",
    capacidadeUtil: 50,
    unidadeCapacidade: "KG",
    cicloMin: 45,
    potenciaKW: 20,
    consumoGasKW: 20,
    precoUnitario: 10000,
    percentualFrete: 0,
    percentualInstalacao: 0,
    ...overrides,
  });
}

function input(overrides: {
  premissas?: Record<string, unknown>;
  cardapio?: Preparacao[];
  equipamentos?: Equipamento[];
  tabelaPrecos?: ReturnType<typeof defaultTabelaPrecos>;
}) {
  return estimateRequestSchema.parse({
    premissas: premissasSchema.parse(overrides.premissas ?? {}),
    cardapio: overrides.cardapio ?? [prep({ codigo: "P1", nome: "Arroz" })],
    equipamentos: overrides.equipamentos ?? [coccao()],
    ambientes: defaultAmbientes(),
    usosAgua: defaultUsosAgua(),
    tabelaPrecos: overrides.tabelaPrecos ?? defaultTabelaPrecos(),
  });
}

describe("budget-engine — capacidade e massa (§2)", () => {
  it("calcula a demanda de produção por hora a partir da janela de pico", () => {
    const estimate = estimateKitchenBudget(input({ premissas: { capacidadeDiaria: 2000, janelaPicoHoras: 2 } }));
    expect(estimate.dimensionamento.refeicoesPorHoraDistribuicao).toBe(1000);
    expect(estimate.dimensionamento.horasDistribuicao).toBe(2);
  });

  it("usa 8 horas quando a distribuição é escalonada", () => {
    const estimate = estimateKitchenBudget(
      input({ premissas: { capacidadeDiaria: 2000, turnoEscalonado: true } })
    );
    expect(estimate.dimensionamento.horasDistribuicao).toBe(8);
    expect(estimate.dimensionamento.refeicoesPorHoraDistribuicao).toBe(250);
  });

  it("calcula massa pronta e comprada por preparação (porção × refeições × fator)", () => {
    const estimate = estimateKitchenBudget(
      input({
        cardapio: [prep({ codigo: "P1", nome: "Preparação 300 kg", porcaoProntaG: 150, quantidadeRefeicoes: 2000, fatorRendimento: 1 })],
      })
    );
    expect(estimate.dimensionamento.massaTotalProntaKg).toBe(300);
    expect(estimate.dimensionamento.massaTotalCompradaKg).toBe(300);
  });
});

describe("budget-engine — dimensionamento de equipamentos (§4)", () => {
  it("reproduz o exemplo da memória: 300 kg em 3 h com 50 kg/ciclo e ciclo de 45 min → 2 unidades", () => {
    const estimate = estimateKitchenBudget(
      input({
        premissas: { horasProducao: 3, capacidadeDiaria: 2000 },
        cardapio: [prep({ codigo: "P1", nome: "Carne", porcaoProntaG: 150, quantidadeRefeicoes: 2000, fatorRendimento: 1 })],
        equipamentos: [coccao({ capacidadeUtil: 50, cicloMin: 45 })],
      })
    );
    const equipamento = estimate.dimensionamento.equipamentos[0];
    // 300 kg / 3 h = 100 kg/h; capacidade = 50 / 0,75 h = 66,7 kg/h → ceil(1,5) = 2.
    expect(equipamento.quantidade).toBe(2);
    expect(equipamento.capacidadeProjeto).toBe(100);
    expect(equipamento.origemQuantidade).toBe("DIMENSIONAMENTO");
  });

  it("respeita quantidade manual informada no cadastro", () => {
    const estimate = estimateKitchenBudget(
      input({ equipamentos: [coccao({ quantidadeManual: 5 })] })
    );
    expect(estimate.dimensionamento.equipamentos[0].quantidade).toBe(5);
    expect(estimate.dimensionamento.equipamentos[0].origemQuantidade).toBe("CADASTRO");
  });

  it("dimensiona câmaras frias pelo volume estocado (massa × fator volumétrico × dias)", () => {
    const estimate = estimateKitchenBudget(
      input({
        cardapio: [prep({ codigo: "P1", nome: "Congelados", porcaoProntaG: 100, quantidadeRefeicoes: 1000, fatorRendimento: 1 })],
        equipamentos: [
          equipamentoSchema.parse({
            codigo: "REF-TEST",
            familia: "REFRIGERACAO",
            descricao: "Câmara 1000 L",
            capacidadeUtil: 1000,
            unidadeCapacidade: "LITRO",
          }),
        ],
      })
    );
    // 100 kg × 1,3 L/kg × 2 dias = 260 L → ceil(0,26) = 1 unidade.
    expect(estimate.dimensionamento.equipamentos[0].quantidade).toBe(1);
  });
});

describe("budget-engine — infraestrutura (§5)", () => {
  it("calcula potência instalada, demanda elétrica e exaustão a partir dos equipamentos", () => {
    const estimate = estimateKitchenBudget(
      input({
        equipamentos: [
          coccao({ potenciaKW: 20, consumoGasKW: 20, quantidadeManual: 2 }),
          equipamentoSchema.parse({
            codigo: "EXA-TEST",
            familia: "EXAUSTAO",
            descricao: "Coifa",
            capacidadeUtil: 2,
            unidadeCapacidade: "M2",
          }),
        ],
      })
    );
    expect(estimate.dimensionamento.potenciaInstaladaKW).toBe(40);
    expect(estimate.dimensionamento.demandaEletricaKW).toBe(28); // 40 × 0,7
    expect(estimate.dimensionamento.consumoGasKW).toBe(24); // 40 × 0,6
    expect(estimate.dimensionamento.vazaoExaustaoM3h).toBe(80); // 2 m² × 40 m³/h·m²
  });

  it("soma os usos de água em volume diário", () => {
    const estimate = estimateKitchenBudget(
      input({
        tabelaPrecos: defaultTabelaPrecos(),
      })
    );
    // Tabela padrão: 20×40×4 + 15×60×3 + 25×90×3 + 18×45×3 + 12×60×3 = 17.240 L = 17,24 m³.
    expect(estimate.dimensionamento.aguaDiaM3).toBeCloseTo(17.24, 2);
    expect(estimate.dimensionamento.esgotoDiaM3).toBeCloseTo(15.52, 2);
  });
});

describe("budget-engine — consolidação de custos (§6/§7)", () => {
  it("consolida direto, indiretos, reserva e BDI de forma transparente", () => {
    const estimate = estimateKitchenBudget(
      input({
        premissas: {
          percentualIndiretos: 10,
          percentualContingencia: 5,
          bdiPercentual: 25,
          fatorCustoLocal: 1,
        },
        equipamentos: [coccao({ precoUnitario: 1000, quantidadeManual: 1, percentualFrete: 0, percentualInstalacao: 0 })],
        tabelaPrecos: [
          { codigo: "G3-PISO", descricao: "Piso", unidade: "m²", pu: 100, fonte: "teste", dataBase: "2026-10" },
        ],
      })
    );
    const c = estimate.consolidacao;
    const area = estimate.dimensionamento.areaTotalM2; // 300 m² de programa
    expect(c.custoDireto).toBeCloseTo(area * 100 + 1000, 2);
    expect(c.custoIndireto).toBeCloseTo(c.custoDireto * 0.1, 2);
    expect(c.custoBase).toBeCloseTo(c.custoDireto + c.custoIndireto, 2);
    expect(c.contingencia).toBeCloseTo(c.custoBase * 0.05, 2);
    expect(c.bdi).toBeCloseTo((c.custoBase + c.contingencia) * 0.25, 2);
    expect(c.totalGeral).toBeCloseTo(c.custoBase + c.contingencia + c.bdi, 2);
    expect(c.custoPorRefeicao).toBeCloseTo(c.totalGeral / 2000, 2);
  });

  it("gera linhas de quantitativo com rastreabilidade (grupo, origem e fonte do preço)", () => {
    const estimate = estimateKitchenBudget(input({}));
    expect(estimate.quantitativos.length).toBeGreaterThan(10);
    for (const linha of estimate.quantitativos) {
      expect(linha.grupo).toBeGreaterThanOrEqual(1);
      expect(linha.grupo).toBeLessThanOrEqual(12);
      expect(["DIMENSIONAMENTO", "INDICE_PRELIMINAR", "CADASTRO"]).toContain(linha.origem);
      expect(linha.fontePreco.length).toBeGreaterThan(0);
    }
    expect(estimate.quantitativos.some((linha) => linha.codigo.startsWith("G9-EQ-"))).toBe(true);
  });

  it("emite avisos para PU ilustrativo, preço ausente e área não informada", () => {
    const semPreco = defaultTabelaPrecos().filter((preco) => preco.codigo !== "G3-PISO");
    const estimate = estimateKitchenBudget(input({ tabelaPrecos: semPreco }));
    expect(estimate.avisos.some((aviso) => aviso.includes("ilustrativ"))).toBe(true);
    expect(estimate.avisos.some((aviso) => aviso.includes("G3-PISO"))).toBe(true);
    expect(estimate.avisos.some((aviso) => aviso.includes("Área disponível não informada"))).toBe(true);
  });

  it("avisa quando a área do programa supera a área disponível", () => {
    const estimate = estimateKitchenBudget(input({ premissas: { areaDisponivelM2: 100 } }));
    expect(estimate.avisos.some((aviso) => aviso.includes("maior que a área disponível"))).toBe(true);
  });

  it("mantém ambientes padrão válidos (§3.1)", () => {
    expect(defaultAmbientes().length).toBeGreaterThanOrEqual(6);
    const soma = defaultAmbientes().reduce((total, ambiente) => total + ambiente.areaM2, 0);
    expect(soma).toBeGreaterThan(0);
  });
});

describe("budget-schemas — validação de entrada", () => {
  it("rejeita capacidade diária fora do intervalo", () => {
    const result = premissasSchema.safeParse({ capacidadeDiaria: 10 });
    expect(result.success).toBe(false);
  });

  it("rejeita cardápio vazio", () => {
    expect(cardapioSchema.safeParse([]).success).toBe(false);
  });

  it("aplica defaults quando a entrada omite premissas", () => {
    const result = estimateRequestSchema.parse({
      cardapio: [prep({ codigo: "P1", nome: "Arroz" })],
      equipamentos: [coccao()],
      ambientes: defaultAmbientes(),
      usosAgua: defaultUsosAgua(),
      tabelaPrecos: defaultTabelaPrecos(),
    });
    expect(result.premissas.capacidadeDiaria).toBe(2000);
    expect(result.premissas.janelaPicoHoras).toBe(2);
  });
});
