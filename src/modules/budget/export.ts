// export.ts — geração dos arquivos de saída do cálculo (puro, usado pelo
// cliente para baixar JSON/CSV). O JSON segue o schemaVersion do módulo e
// é a entrada estruturada da fase de orçamentação (E08); o CSV é a visão
// tabular legível em planilha.

import type { BudgetEstimate, QuantitativoLinha } from "./engine";
import { GRUPOS_ORCAMENTO } from "./defaults";

export function buildBudgetJson(estimate: BudgetEstimate): string {
  return `${JSON.stringify(estimate, null, 2)}\n`;
}

function csvEscape(value: string): string {
  if (/[;"\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// Números em notação pt-BR (vírgua decimal) com separador ";".
function num(value: number, decimals = 2): string {
  return value.toFixed(decimals).replace(".", ",");
}

function row(cells: Array<string | number>): string {
  return cells
    .map((cell) => csvEscape(typeof cell === "number" ? num(cell) : cell))
    .join(";");
}

export function buildBudgetCsv(estimate: BudgetEstimate): string {
  const lines: string[] = [];

  lines.push("SEÇÃO;CAMPO;VALOR");
  lines.push(row(["PREMISSAS", "capacidade diária (refeições)", estimate.premissas.capacidadeDiaria]));
  lines.push(row(["PREMISSAS", "tipo de cozinha", estimate.premissas.tipoCozinha]));
  lines.push(row(["PREMISSAS", "tipo de intervenção", estimate.premissas.tipoIntervencao]));
  lines.push(row(["PREMISSAS", "modelo de distribuição", estimate.premissas.modeloDistribuicao]));
  lines.push(row(["PREMISSAS", "janela de pico (h)", estimate.premissas.janelaPicoHoras]));
  lines.push(row(["PREMISSAS", "horas de produção", estimate.premissas.horasProducao]));
  lines.push(row(["PREMISSAS", "fonte de energia na cocção", estimate.premissas.fonteEnergiaCoccao]));
  lines.push(row(["PREMISSAS", "município", estimate.premissas.municipio || "—"]));
  lines.push(row(["PREMISSAS", "UF", estimate.premissas.uf || "—"]));
  lines.push(row(["PREMISSAS", "data-base", estimate.premissas.dataBase]));
  lines.push(
    row(["PREMISSAS", "fator de custo local", estimate.premissas.fatorCustoLocal])
  );

  lines.push("");
  lines.push("SEÇÃO;CAMPO;VALOR");
  lines.push(row(["DIMENSIONAMENTO", "refeições/hora na distribuição", estimate.dimensionamento.refeicoesPorHoraDistribuicao]));
  lines.push(row(["DIMENSIONAMENTO", "massa pronta total (kg)", estimate.dimensionamento.massaTotalProntaKg]));
  lines.push(row(["DIMENSIONAMENTO", "massa comprada total (kg)", estimate.dimensionamento.massaTotalCompradaKg]));
  lines.push(row(["DIMENSIONAMENTO", "área total do programa (m²)", estimate.dimensionamento.areaTotalM2]));
  lines.push(row(["DIMENSIONAMENTO", "potência instalada (kW)", estimate.dimensionamento.potenciaInstaladaKW]));
  lines.push(row(["DIMENSIONAMENTO", "demanda elétrica (kW)", estimate.dimensionamento.demandaEletricaKW]));
  lines.push(row(["DIMENSIONAMENTO", "consumo de gás (kW)", estimate.dimensionamento.consumoGasKW]));
  lines.push(row(["DIMENSIONAMENTO", "vazão de exaustão (m³/h)", estimate.dimensionamento.vazaoExaustaoM3h]));
  lines.push(row(["DIMENSIONAMENTO", "carga térmica de climatização (kW)", estimate.dimensionamento.cargaTermicaKW]));
  lines.push(row(["DIMENSIONAMENTO", "água (m³/dia)", estimate.dimensionamento.aguaDiaM3]));
  lines.push(row(["DIMENSIONAMENTO", "esgoto (m³/dia)", estimate.dimensionamento.esgotoDiaM3]));

  lines.push("");
  lines.push("GRUPO;GRUPO_NOME;CODIGO;DESCRICAO;UNIDADE;QUANTIDADE;PU;CUSTO_TOTAL;ORIGEM;FONTE_PRECO;DATA_BASE");
  for (const linha of estimate.quantitativos) {
    lines.push(
      row([
        linha.grupo,
        linha.grupoNome,
        linha.codigo,
        linha.descricao,
        linha.unidade,
        linha.quantidade,
        linha.pu,
        linha.custoTotal,
        linha.origem,
        linha.fontePreco,
        linha.dataBasePreco,
      ])
    );
  }

  lines.push("");
  lines.push("GRUPO;NOME;CUSTO");
  const porGrupo = new Map<number, number>();
  for (const linha of estimate.quantitativos) {
    porGrupo.set(linha.grupo, (porGrupo.get(linha.grupo) ?? 0) + linha.custoTotal);
  }
  for (const [grupo, total] of [...porGrupo.entries()].sort((a, b) => a[0] - b[0])) {
    lines.push(row([grupo, GRUPOS_ORCAMENTO[grupo] ?? `Grupo ${grupo}`, total]));
  }

  lines.push("");
  lines.push("ETAPA;VALOR");
  lines.push(row(["Custo direto", estimate.consolidacao.custoDireto]));
  lines.push(row([`Custos indiretos (${num(estimate.consolidacao.percentuais.indiretos)}%)`, estimate.consolidacao.custoIndireto]));
  lines.push(row(["Custo base", estimate.consolidacao.custoBase]));
  lines.push(row([`Reserva de risco (${num(estimate.consolidacao.percentuais.contingencia)}%)`, estimate.consolidacao.contingencia]));
  lines.push(row([`BDI (${num(estimate.consolidacao.percentuais.bdi)}%)`, estimate.consolidacao.bdi]));
  lines.push(row(["TOTAL GERAL", estimate.consolidacao.totalGeral]));
  lines.push(row(["Custo por refeição (indicador)", estimate.consolidacao.custoPorRefeicao]));

  lines.push("");
  lines.push("AVISOS");
  for (const aviso of estimate.avisos) {
    lines.push(csvEscape(aviso));
  }

  return `${lines.join("\n")}\n`;
}

export function budgetFileName(estimate: BudgetEstimate, extension: "json" | "csv"): string {
  return `orcamento-cozinha-${estimate.premissas.capacidadeDiaria}-ref-${estimate.premissas.dataBase}.${extension}`;
}

export type { QuantitativoLinha };
