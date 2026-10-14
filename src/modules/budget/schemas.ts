// schemas.ts — contrato de entrada do módulo de orçamento de cozinha industrial.
// Fonte metodológica: memoria_calculo.txt (§1 premissas, §2 capacidade, §4 equipamentos,
// §5 infraestrutura, §6/§7 custos). Nada é persistido: o cálculo alimenta a fase de
// orçamentação (E08) por exportação JSON/CSV.

import { z } from "zod";

export const tipoCozinhaSchema = z.enum([
  "REFEITORIO",
  "HOSPITALAR",
  "ESCOLAR",
  "MARMITARIA",
  "RESTAURANTE",
]);

export const tipoIntervencaoSchema = z.enum(["CONSTRUCAO_NOVA", "ADAPTACAO", "REFORMA"]);

export const modeloDistribuicaoSchema = z.enum(["REFEITORIO", "MARMITAS", "MISTO"]);

export const fonteEnergiaSchema = z.enum(["GAS", "ELETRICA", "VAPOR", "MISTA", "A_DEFINIR"]);

export const nivelAcabamentoSchema = z.enum(["PADRAO", "ALTO"]);

export const grupoPreparacaoSchema = z.enum([
  "PRAATO_FUNDAMENTO",
  "CARNE_OU_PROTEINA",
  "GUARNICAO",
  "SALADA",
  "SOBREMESA",
  "BEBIDA",
  "OUTRO",
]);

export const familiaEquipamentoSchema = z.enum([
  "COCCAO",
  "FORNO",
  "PREPARO",
  "LAVAGEM",
  "REFRIGERACAO",
  "DISTRIBUICAO",
  "BANCADA",
  "EXAUSTAO",
  "TRANSPORTE",
]);

export const unidadeCapacidadeSchema = z.enum(["KG", "REFEICAO", "LITRO", "M3H", "M2"]);

// §1 — premissas e requisitos do projeto (camada 1).
export const premissasSchema = z.object({
  capacidadeDiaria: z.number().int().min(50).max(50000).default(2000),
  horasProducao: z.number().min(1).max(24).default(4),
  janelaPicoHoras: z.number().min(0.5).max(12).default(2),
  turnoEscalonado: z.boolean().default(false),
  tipoCozinha: tipoCozinhaSchema.default("REFEITORIO"),
  tipoIntervencao: tipoIntervencaoSchema.default("ADAPTACAO"),
  modeloDistribuicao: modeloDistribuicaoSchema.default("REFEITORIO"),
  fonteEnergiaCoccao: fonteEnergiaSchema.default("GAS"),
  nivelAcabamento: nivelAcabamentoSchema.default("PADRAO"),
  areaDisponivelM2: z.number().min(0).nullable().default(null),
  municipio: z.string().trim().max(120).default(""),
  uf: z.string().trim().max(2).default(""),
  fatorCustoLocal: z.number().min(0.5).max(2).default(1),
  percentualIndiretos: z.number().min(0).max(50).default(10),
  percentualContingencia: z.number().min(0).max(40).default(10),
  bdiPercentual: z.number().min(0).max(60).default(20),
  dataBase: z.string().regex(/^\d{4}-\d{2}$/).default("2026-10"),
});

export const preparacaoSchema = z.object({
  codigo: z.string().trim().min(1).max(20),
  nome: z.string().trim().min(1).max(120),
  porcaoProntaG: z.number().positive().max(3000),
  quantidadeRefeicoes: z.number().int().min(1).max(100000),
  fatorRendimento: z.number().min(0.1).max(5).default(1),
  grupo: grupoPreparacaoSchema.default("OUTRO"),
});

export const cardapioSchema = z.array(preparacaoSchema).min(1);

export const equipamentoSchema = z.object({
  codigo: z.string().trim().min(1).max(20),
  familia: familiaEquipamentoSchema,
  descricao: z.string().trim().min(1).max(160),
  capacidadeUtil: z.number().positive(),
  unidadeCapacidade: unidadeCapacidadeSchema,
  cicloMin: z.number().positive().max(480).nullable().default(null),
  potenciaKW: z.number().min(0).max(500).default(0),
  consumoGasKW: z.number().min(0).max(500).default(0),
  demandaDia: z.number().min(0).nullable().default(null),
  precoUnitario: z.number().min(0).default(0),
  percentualFrete: z.number().min(0).max(50).default(0),
  percentualInstalacao: z.number().min(0).max(50).default(0),
  quantidadeManual: z.number().int().min(1).max(999).nullable().default(null),
});

export const equipamentosSchema = z.array(equipamentoSchema).min(1);

export const ambienteSchema = z.object({
  codigo: z.string().trim().min(1).max(20),
  nome: z.string().trim().min(1).max(120),
  areaM2: z.number().positive().max(10000),
});

export const ambientesSchema = z.array(ambienteSchema).min(1);

export const usoAguaSchema = z.object({
  codigo: z.string().trim().min(1).max(20),
  descricao: z.string().trim().min(1).max(120),
  vazaoLmin: z.number().positive().max(2000),
  minutosPorOcorrencia: z.number().positive().max(600),
  ocorrenciasDia: z.number().int().min(1).max(200),
});

export const usosAguaSchema = z.array(usoAguaSchema).min(1);

// §6.1 — PU editável por código de quantitativo (origem SINAPI/cotação/referência).
export const precoSchema = z.object({
  codigo: z.string().trim().min(1).max(30),
  descricao: z.string().trim().min(1).max(160),
  unidade: z.string().trim().min(1).max(12),
  pu: z.number().min(0).max(100000000),
  fonte: z.string().trim().min(1).max(120),
  dataBase: z.string().regex(/^\d{4}-\d{2}$/),
});

export const tabelaPrecosSchema = z.array(precoSchema);

export const estimateRequestSchema = z.object({
  premissas: premissasSchema.default(() => premissasSchema.parse({})),
  cardapio: cardapioSchema,
  equipamentos: equipamentosSchema,
  ambientes: ambientesSchema,
  usosAgua: usosAguaSchema,
  tabelaPrecos: tabelaPrecosSchema,
});

export type TipoCozinha = z.infer<typeof tipoCozinhaSchema>;
export type TipoIntervencao = z.infer<typeof tipoIntervencaoSchema>;
export type ModeloDistribuicao = z.infer<typeof modeloDistribuicaoSchema>;
export type FonteEnergia = z.infer<typeof fonteEnergiaSchema>;
export type NivelAcabamento = z.infer<typeof nivelAcabamentoSchema>;
export type GrupoPreparacao = z.infer<typeof grupoPreparacaoSchema>;
export type FamiliaEquipamento = z.infer<typeof familiaEquipamentoSchema>;
export type UnidadeCapacidade = z.infer<typeof unidadeCapacidadeSchema>;
export type Premissas = z.infer<typeof premissasSchema>;
export type Preparacao = z.infer<typeof preparacaoSchema>;
export type Equipamento = z.infer<typeof equipamentoSchema>;
export type Ambiente = z.infer<typeof ambienteSchema>;
export type UsoAgua = z.infer<typeof usoAguaSchema>;
export type Preco = z.infer<typeof precoSchema>;
export type EstimateRequest = z.infer<typeof estimateRequestSchema>;
