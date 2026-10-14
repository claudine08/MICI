// engine.ts — cálculo puro do orçamento preliminar de implantação de cozinha
// industrial. Sem I/O: recebe a entrada validada e devolve quantitativos,
// custos e avisos, com rastreabilidade de cada linha até a sua origem
// (dimensionamento, índice preliminar ou cadastro) — memoria_calculo §§2-7.

import { BUDGET_SCHEMA_VERSION, FATORES, GRUPOS_ORCAMENTO } from "./defaults";
import type {
  Equipamento,
  EstimateRequest,
  FamiliaEquipamento,
  GrupoPreparacao,
  Preparacao,
} from "./schemas";

export type OrigemQuantitativo = "DIMENSIONAMENTO" | "INDICE_PRELIMINAR" | "CADASTRO";

export interface QuantitativoLinha {
  grupo: number;
  grupoNome: string;
  codigo: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  pu: number;
  custoTotal: number;
  origem: OrigemQuantitativo;
  fontePreco: string;
  dataBasePreco: string;
  detalhe?: string;
}

export interface EquipamentoDimensionado {
  codigo: string;
  familia: FamiliaEquipamento;
  descricao: string;
  quantidade: number;
  origemQuantidade: OrigemQuantitativo;
  capacidadeUtil: number;
  unidadeCapacidade: string;
  capacidadeProjeto: number;
  potenciaKW: number;
  consumoGasKW: number;
  custoUnitarioTotal: number;
  custoTotal: number;
}

export interface Dimensionamento {
  refeicoesPorHoraDistribuicao: number;
  horasDistribuicao: number;
  massaTotalProntaKg: number;
  massaTotalCompradaKg: number;
  areaTotalM2: number;
  potenciaInstaladaKW: number;
  demandaEletricaKW: number;
  consumoGasKW: number;
  vazaoExaustaoM3h: number;
  cargaTermicaKW: number;
  aguaDiaM3: number;
  esgotoDiaM3: number;
  equipamentos: EquipamentoDimensionado[];
}

export interface Consolidacao {
  custoDireto: number;
  custoIndireto: number;
  custoBase: number;
  contingencia: number;
  bdi: number;
  totalGeral: number;
  custoPorRefeicao: number;
  percentuais: {
    indiretos: number;
    contingencia: number;
    bdi: number;
    fatorCustoLocal: number;
  };
}

export interface BudgetEstimate {
  schemaVersion: string;
  fonte: string;
  referenciaMetodologica: string;
  geradoEm: string;
  premissas: EstimateRequest["premissas"];
  fatores: typeof FATORES;
  dimensionamento: Dimensionamento;
  quantitativos: QuantitativoLinha[];
  consolidacao: Consolidacao;
  avisos: string[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function ceilMin1(value: number): number {
  return Math.max(1, Math.ceil(Math.round(value * 100) / 100));
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

const FAMILIAS_COZINHA: FamiliaEquipamento[] = [
  "COCCAO",
  "FORNO",
  "PREPARO",
  "LAVAGEM",
  "REFRIGERACAO",
  "DISTRIBUICAO",
  "EXAUSTAO",
];

const FAMILIAS_MOBILIARIO: FamiliaEquipamento[] = ["BANCADA", "TRANSPORTE"];

const GRUPOS_COM_COCA: GrupoPreparacao[] = ["PRAATO_FUNDAMENTO", "CARNE_OU_PROTEINA", "GUARNICAO"];
const GRUPOS_COM_FORNO: GrupoPreparacao[] = ["CARNE_OU_PROTEINA", "GUARNICAO", "SOBREMESA"];

function massaPreparacao(preparacao: Preparacao): { pronta: number; comprada: number } {
  const pronta = (preparacao.quantidadeRefeicoes * preparacao.porcaoProntaG) / 1000;
  return { pronta, comprada: pronta * preparacao.fatorRendimento };
}

function demandaAutomatica(
  familia: FamiliaEquipamento,
  cardapio: Preparacao[],
  massaCompradaTotal: number
): number {
  const grupos =
    familia === "COCCAO" ? GRUPOS_COM_COCA : familia === "FORNO" ? GRUPOS_COM_FORNO : null;
  if (!grupos) return massaCompradaTotal;
  const massaSelecionada = sum(
    cardapio
      .filter((preparacao) => grupos.includes(preparacao.grupo))
      .map((preparacao) => massaPreparacao(preparacao).comprada)
  );
  return massaSelecionada > 0 ? massaSelecionada : massaCompradaTotal;
}

function capacidadePorHora(equipamento: Equipamento): number {
  // Sem ciclo informado, a capacidade util é tratada como taxa por hora (kg/h, ref/h…).
  if (!equipamento.cicloMin) return equipamento.capacidadeUtil;
  return equipamento.capacidadeUtil / (equipamento.cicloMin / 60);
}

function dimensionarEquipamento(
  equipamento: Equipamento,
  contexto: {
    cardapio: Preparacao[];
    massaCompradaTotal: number;
    horasProducao: number;
    refeicoesPorHora: number;
    areaTotalM2: number;
    massaProntaTotal: number;
    vazaoCoifasM3h: number;
    capacidadeDiaria: number;
  }
): { quantidade: number; origem: OrigemQuantitativo } {
  if (equipamento.quantidadeManual) {
    return { quantidade: equipamento.quantidadeManual, origem: "CADASTRO" };
  }

  switch (equipamento.familia) {
    case "COCCAO":
    case "FORNO":
    case "PREPARO": {
      const demandaKgDia = equipamento.demandaDia ?? demandaAutomatica(
        equipamento.familia,
        contexto.cardapio,
        contexto.massaCompradaTotal
      );
      const kgHora = demandaKgDia / contexto.horasProducao;
      return {
        quantidade: ceilMin1(kgHora / capacidadePorHora(equipamento)),
        origem: "DIMENSIONAMENTO",
      };
    }
    case "LAVAGEM": {
      const demandaRefHora =
        contexto.refeicoesPorHora * FATORES.fatorUtensiliosPorRefeicao;
      return {
        quantidade: ceilMin1(demandaRefHora / capacidadePorHora(equipamento)),
        origem: "DIMENSIONAMENTO",
      };
    }
    case "REFRIGERACAO": {
      const volumeL =
        contexto.massaCompradaTotal *
        FATORES.fatorVolumetricoLPorKg *
        FATORES.diasEstoqueRefrigerados;
      return { quantidade: ceilMin1(volumeL / equipamento.capacidadeUtil), origem: "DIMENSIONAMENTO" };
    }
    case "DISTRIBUICAO": {
      return {
        quantidade: ceilMin1(contexto.refeicoesPorHora / equipamento.capacidadeUtil),
        origem: "DIMENSIONAMENTO",
      };
    }
    case "EXAUSTAO": {
      if (equipamento.unidadeCapacidade === "M2") {
        // Coifas vêm do layout (NBR 14518): 1 unidade por item, ajustável manualmente.
        return { quantidade: 1, origem: "INDICE_PRELIMINAR" };
      }
      return {
        quantidade: ceilMin1(contexto.vazaoCoifasM3h / equipamento.capacidadeUtil),
        origem: "DIMENSIONAMENTO",
      };
    }
    case "BANCADA": {
      return {
        quantidade: ceilMin1(contexto.areaTotalM2 / equipamento.capacidadeUtil),
        origem: "INDICE_PRELIMINAR",
      };
    }
    case "TRANSPORTE": {
      if (equipamento.unidadeCapacidade === "REFEICAO") {
        return {
          quantidade: ceilMin1(
            contexto.capacidadeDiaria /
              (equipamento.capacidadeUtil * FATORES.rotasInternasPorDia)
          ),
          origem: "INDICE_PRELIMINAR",
        };
      }
      return {
        quantidade: ceilMin1(
          (contexto.massaProntaTotal * FATORES.fatorVolumetricoLPorKg) /
            equipamento.capacidadeUtil
        ),
        origem: "INDICE_PRELIMINAR",
      };
    }
    default:
      return { quantidade: 1, origem: "INDICE_PRELIMINAR" };
  }
}

export function estimateKitchenBudget(input: EstimateRequest): BudgetEstimate {
  const { premissas, cardapio, equipamentos, ambientes, usosAgua, tabelaPrecos } = input;
  const avisos: string[] = [
    "Estudo preliminar: os quantitativos de obra civil e instalações usam índices explícitos e devem ser substituídos pelo projeto executivo (memoria_calculo §6).",
  ];

  const horasDistribuicao = premissas.turnoEscalonado ? 8 : premissas.janelaPicoHoras;
  const refeicoesPorHora = ceilMin1(premissas.capacidadeDiaria / horasDistribuicao);
  if (premissas.turnoEscalonado) {
    avisos.push("Distribuição escalonada assumida: janela de 8 horas para o cálculo da linha de serviço.");
  }

  const massas = cardapio.map((preparacao) => massaPreparacao(preparacao));
  const massaTotalProntaKg = round2(sum(massas.map((m) => m.pronta)));
  const massaTotalCompradaKg = round2(sum(massas.map((m) => m.comprada)));

  const areaTotalM2 = round2(sum(ambientes.map((ambiente) => ambiente.areaM2)));
  if (premissas.areaDisponivelM2 == null) {
    avisos.push("Área disponível não informada — quantitativos de obra civil consideram apenas a soma dos ambientes.");
  } else if (areaTotalM2 > premissas.areaDisponivelM2) {
    avisos.push(
      `Área do programa (${areaTotalM2} m²) maior que a área disponível (${premissas.areaDisponivelM2} m²) — revisar o programa de necessidades.`
    );
  }

  const areaCoifasM2 = sum(
    equipamentos
      .filter((eq) => eq.familia === "EXAUSTAO" && eq.unidadeCapacidade === "M2")
      .map((eq) => eq.capacidadeUtil)
  );
  const vazaoExaustaoM3h = round2(areaCoifasM2 * FATORES.vazaoEspecificaExaustaoM3hPorM2);
  if (areaCoifasM2 === 0) {
    avisos.push("Nenhuma coifa informada — exaustão não dimensionada (use o layout para especificar coifas).");
  }

  const contexto = {
    cardapio,
    massaCompradaTotal: massaTotalCompradaKg,
    horasProducao: premissas.horasProducao,
    refeicoesPorHora,
    areaTotalM2,
    massaProntaTotal: massaTotalProntaKg,
    vazaoCoifasM3h: vazaoExaustaoM3h,
    capacidadeDiaria: premissas.capacidadeDiaria,
  };

  const equipamentosDimensionados: EquipamentoDimensionado[] = equipamentos.map((equipamento) => {
    const { quantidade, origem } = dimensionarEquipamento(equipamento, contexto);
    const custoUnitarioTotal = round2(
      equipamento.precoUnitario *
        (1 + equipamento.percentualFrete / 100 + equipamento.percentualInstalacao / 100)
    );
    return {
      codigo: equipamento.codigo,
      familia: equipamento.familia,
      descricao: equipamento.descricao,
      quantidade,
      origemQuantidade: origem,
      capacidadeUtil: equipamento.capacidadeUtil,
      unidadeCapacidade: equipamento.unidadeCapacidade,
      capacidadeProjeto: round2(quantidade * equipamento.capacidadeUtil),
      potenciaKW: round2(quantidade * equipamento.potenciaKW),
      consumoGasKW: round2(quantidade * equipamento.consumoGasKW),
      custoUnitarioTotal,
      custoTotal: round2(custoUnitarioTotal * quantidade),
    };
  });

  const potenciaInstaladaKW = round2(sum(equipamentosDimensionados.map((eq) => eq.potenciaKW)));
  const demandaEletricaKW = round2(potenciaInstaladaKW * FATORES.fatorSimultaneidadeEletrica);
  const consumoGasNominalKW = sum(equipamentosDimensionados.map((eq) => eq.consumoGasKW));
  const usaGas =
    premissas.fonteEnergiaCoccao === "GAS" || premissas.fonteEnergiaCoccao === "MISTA";
  const consumoGasKW = round2(consumoGasNominalKW * FATORES.fatorSimultaneidadeGas);
  if (premissas.fonteEnergiaCoccao === "A_DEFINIR") {
    avisos.push("Fonte de energia para cocção a definir — grupo de gás pode não ser aplicável.");
  } else if (!usaGas && consumoGasNominalKW > 0) {
    avisos.push(
      "Equipamentos com consumo de gás na lista, mas a fonte de energia declarada não é gás — revisar premissas ou equipamentos."
    );
  }

  const cargaTermicaKW = round2(
    (areaTotalM2 * (FATORES.cargaTermicaWPorM2[premissas.nivelAcabamento] ?? 180)) / 1000
  );

  const aguaDiaM3 = round2(
    sum(usosAgua.map((uso) => uso.vazaoLmin * uso.minutosPorOcorrencia * uso.ocorrenciasDia)) / 1000
  );
  const esgotoDiaM3 = round2(aguaDiaM3 * FATORES.fatorEsgotoSobreAgua);

  const precoPorCodigo = new Map(tabelaPrecos.map((preco) => [preco.codigo, preco]));
  const quantitativos: QuantitativoLinha[] = [];
  const avisosPreco = new Set<string>();

  function adicionarLinha(
    grupo: number,
    codigo: string,
    descricao: string,
    unidade: string,
    quantidade: number,
    origem: OrigemQuantitativo,
    detalhe?: string,
    puDireto?: number
  ): void {
    const preco = precoPorCodigo.get(codigo);
    if (puDireto === undefined) {
      if (!preco) {
        avisosPreco.add(`Sem preço cadastrado para ${codigo} (${descricao}).`);
      }
      if (preco && preco.fonte.toLowerCase().includes("ilustrativ")) {
        avisosPreco.add(`PU ilustrativo em ${codigo} — substituir por cotação local/SINAPI.`);
      }
    }
    const pu = round2(puDireto ?? preco?.pu ?? 0);
    quantitativos.push({
      grupo,
      grupoNome: GRUPOS_ORCAMENTO[grupo] ?? `Grupo ${grupo}`,
      codigo,
      descricao,
      unidade,
      quantidade: round2(quantidade),
      pu,
      custoTotal: round2(pu * quantidade * premissas.fatorCustoLocal),
      origem,
      fontePreco: puDireto !== undefined ? "cadastro de equipamento" : preco?.fonte ?? "não cadastrada",
      dataBasePreco: preco?.dataBase ?? premissas.dataBase,
      detalhe,
    });
  }

  // 1. Projetos e serviços técnicos
  adicionarLinha(1, "G1-PROJ-CIVIL", "Projeto de arquitetura e obras civis", "m²", areaTotalM2, "INDICE_PRELIMINAR");
  adicionarLinha(1, "G1-PROJ-ELET", "Projeto elétrico", "kW", demandaEletricaKW, "DIMENSIONAMENTO");
  adicionarLinha(1, "G1-PROJ-HIDR", "Projeto hidrossanitário", "m²", areaTotalM2, "INDICE_PRELIMINAR");
  if (usaGas && consumoGasKW > 0) {
    adicionarLinha(1, "G1-PROJ-GAS", "Projeto de gás", "kW", consumoGasKW, "DIMENSIONAMENTO");
  }
  if (vazaoExaustaoM3h > 0) {
    adicionarLinha(1, "G1-PROJ-EXA", "Projeto de exaustão (ABNT NBR 14518)", "m³/h", vazaoExaustaoM3h, "DIMENSIONAMENTO");
  }
  adicionarLinha(1, "G1-PROJ-CLIM", "Projeto de climatização", "kW", cargaTermicaKW, "INDICE_PRELIMINAR");

  // 2. Preparação do local
  const fatorDemolicao = FATORES.fatorDemolicaoPorIntervencao[premissas.tipoIntervencao] ?? 0;
  if (fatorDemolicao > 0) {
    adicionarLinha(
      2,
      "G2-DEM-LOCAL",
      "Demolições, remoções e descarte",
      "m²",
      round2(areaTotalM2 * fatorDemolicao),
      "INDICE_PRELIMINAR",
      `Fator ${fatorDemolicao} para intervenção ${premissas.tipoIntervencao}`
    );
  }
  adicionarLinha(2, "G2-MOB", "Mobilização, proteções e logística de obra", "un", 1, "INDICE_PRELIMINAR");

  // 3. Obras civis
  adicionarLinha(3, "G3-PISO", "Piso para cozinha industrial", "m²", areaTotalM2, "INDICE_PRELIMINAR");
  adicionarLinha(
    3,
    "G3-PAREDE",
    "Revestimento de parede (confirmar no layout)",
    "m²",
    round2(areaTotalM2 * FATORES.fatorParedeSobrePiso),
    "INDICE_PRELIMINAR",
    `Fator parede/piso ${FATORES.fatorParedeSobrePiso}`
  );
  adicionarLinha(3, "G3-TETO", "Teto lavável", "m²", areaTotalM2, "INDICE_PRELIMINAR");
  adicionarLinha(
    3,
    "G3-IMPERM",
    "Impermeabilização de áreas úmidas",
    "m²",
    round2(areaTotalM2 * FATORES.percentualAreaUmida),
    "INDICE_PRELIMINAR",
    `${FATORES.percentualAreaUmida * 100}% da área como áreas úmidas`
  );
  adicionarLinha(3, "G3-PORTA", "Portas higiênicas", "un", Math.max(2, Math.round(areaTotalM2 / 150)), "INDICE_PRELIMINAR");

  // 4. Instalação elétrica
  adicionarLinha(4, "G4-ELET-FORCA", "Instalação elétrica de força", "kW", demandaEletricaKW, "DIMENSIONAMENTO", `Potência instalada ${potenciaInstaladaKW} kW × fator ${FATORES.fatorSimultaneidadeEletrica}`);
  adicionarLinha(4, "G4-ELET-ILUM", "Iluminação e pontos auxiliares", "m²", areaTotalM2, "INDICE_PRELIMINAR");

  // 5. Instalações hidráulicas
  adicionarLinha(5, "G5-HID-AGUA", "Rede de água fria e quente", "m³/dia", aguaDiaM3, "DIMENSIONAMENTO");
  adicionarLinha(5, "G5-HID-ESGOTO", "Rede de esgoto e drenagem", "m³/dia", esgotoDiaM3, "DIMENSIONAMENTO");
  adicionarLinha(
    5,
    "G5-HID-PONTOS",
    "Pontos de descarga, ralos e caixas",
    "un",
    Math.ceil(areaTotalM2 * FATORES.pontosHidraulicosPorM2),
    "INDICE_PRELIMINAR"
  );

  // 6. Gás e segurança
  if (usaGas && consumoGasKW > 0) {
    adicionarLinha(
      6,
      "G6-GAS-REDE",
      "Tubulação e conexões de gás",
      "m",
      round2(areaTotalM2 * FATORES.comprimentoRedeGasMPorM2),
      "INDICE_PRELIMINAR"
    );
    adicionarLinha(6, "G6-GAS-SEG", "Reguladores, válvulas, ensaios e liberação", "un", 1, "INDICE_PRELIMINAR");
  }

  // 7. Exaustão e ventilação
  if (vazaoExaustaoM3h > 0) {
    adicionarLinha(7, "G7-EXA-INST", "Dutos, suportes, filtros e balanceamento", "m³/h", vazaoExaustaoM3h, "DIMENSIONAMENTO");
    adicionarLinha(7, "G7-EXA-ARBAL", "Ar de reposição", "m²", areaTotalM2, "INDICE_PRELIMINAR");
  }

  // 8. Refrigeração (instalação das câmaras; os equipamentos ficam no grupo 9)
  const camaras = equipamentosDimensionados.filter(
    (eq) => eq.familia === "REFRIGERACAO" && eq.capacidadeUtil >= 3000
  );
  if (camaras.length > 0) {
    adicionarLinha(8, "G8-REF-INST", "Instalação de câmaras frias", "un", sum(camaras.map((c) => c.quantidade)), "DIMENSIONAMENTO");
  }

  // 9/10. Equipamentos e mobiliário cotados item a item
  for (const eq of equipamentosDimensionados) {
    const grupo = FAMILIAS_COZINHA.includes(eq.familia) ? 9 : FAMILIAS_MOBILIARIO.includes(eq.familia) ? 10 : 9;
    const linhaGrupo = grupo === 9 ? "G9" : "G10";
    adicionarLinha(
      grupo,
      `${linhaGrupo}-EQ-${eq.codigo}`,
      eq.descricao,
      "un",
      eq.quantidade,
      eq.origemQuantidade,
      `Capacidade útil ${eq.capacidadeUtil} ${eq.unidadeCapacidade} · capacidade de projeto ${eq.capacidadeProjeto} ${eq.unidadeCapacidade} · PU já inclui frete e instalação`,
      eq.custoUnitarioTotal
    );
  }

  // 11/12. Sistemas complementares e comissionamento
  adicionarLinha(11, "G11-AUT", "Automação/monitoramento de processo", "un", 1, "INDICE_PRELIMINAR");
  adicionarLinha(12, "G12-COM-TEST", "Testes, regulagens e comissionamento", "un", 1, "INDICE_PRELIMINAR");
  adicionarLinha(12, "G12-COM-TREIN", "Treinamento e documentação de entrega", "un", 1, "INDICE_PRELIMINAR");

  avisos.push(...avisosPreco);

  // Consolidação (§7): direto → indireto → base → reserva → BDI, tudo explícito.
  const custoDireto = round2(sum(quantitativos.map((linha) => linha.custoTotal)));
  const custoIndireto = round2((custoDireto * premissas.percentualIndiretos) / 100);
  const custoBase = round2(custoDireto + custoIndireto);
  const contingencia = round2((custoBase * premissas.percentualContingencia) / 100);
  const bdi = round2(((custoBase + contingencia) * premissas.bdiPercentual) / 100);
  const totalGeral = round2(custoBase + contingencia + bdi);
  const custoPorRefeicao = round2(totalGeral / premissas.capacidadeDiaria);

  if (premissas.fatorCustoLocal !== 1) {
    avisos.push(`Fator de custo local ${premissas.fatorCustoLocal} aplicado a todos os quantitativos.`);
  }

  return {
    schemaVersion: BUDGET_SCHEMA_VERSION,
    fonte: "MICI — calculadora de implantação de cozinha industrial",
    referenciaMetodologica: "memoria_calculo.txt",
    geradoEm: new Date().toISOString(),
    premissas,
    fatores: FATORES,
    dimensionamento: {
      refeicoesPorHoraDistribuicao: refeicoesPorHora,
      horasDistribuicao,
      massaTotalProntaKg,
      massaTotalCompradaKg,
      areaTotalM2,
      potenciaInstaladaKW,
      demandaEletricaKW,
      consumoGasKW,
      vazaoExaustaoM3h,
      cargaTermicaKW,
      aguaDiaM3,
      esgotoDiaM3,
      equipamentos: equipamentosDimensionados,
    },
    quantitativos,
    consolidacao: {
      custoDireto,
      custoIndireto,
      custoBase,
      contingencia,
      bdi,
      totalGeral,
      custoPorRefeicao,
      percentuais: {
        indiretos: premissas.percentualIndiretos,
        contingencia: premissas.percentualContingencia,
        bdi: premissas.bdiPercentual,
        fatorCustoLocal: premissas.fatorCustoLocal,
      },
    },
    avisos,
  };
}
