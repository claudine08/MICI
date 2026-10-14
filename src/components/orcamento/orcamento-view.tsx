"use client";

import { useState, type ChangeEvent } from "react";
import { Calculator, ChevronLeft, ChevronRight, Download, Plus, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  GRUPOS_ORCAMENTO,
  defaultAmbientes,
  defaultCardapio,
  defaultEquipamentos,
  defaultPremissas,
  defaultTabelaPrecos,
  defaultUsosAgua,
} from "@/modules/budget/defaults";
import { estimateRequestSchema } from "@/modules/budget/schemas";
import type {
  Ambiente,
  Equipamento,
  FonteEnergia,
  ModeloDistribuicao,
  NivelAcabamento,
  Preco,
  Preparacao,
  Premissas,
  TipoCozinha,
  TipoIntervencao,
  UsoAgua,
} from "@/modules/budget/schemas";
import type { BudgetEstimate } from "@/modules/budget/engine";
import { budgetFileName, buildBudgetCsv, buildBudgetJson } from "@/modules/budget/export";

// Wizard do cálculo preliminar de cozinha industrial: 5 etapas de entrada +
// resultado com exportação JSON/CSV (entrada da fase de orçamentação, E08).

const STEPS = [
  "Premissas",
  "Cardápio",
  "Equipamentos",
  "Ambientes e utilidades",
  "Preços",
  "Resultado",
];

const inputCls =
  "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60";
const smallInputCls =
  "h-8 w-full rounded-md border border-border bg-surface px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60";

const TIPO_COZINHA_LABELS: Record<TipoCozinha, string> = {
  REFEITORIO: "Refeitório corporativo/industrial",
  HOSPITALAR: "Hospitalar",
  ESCOLAR: "Escolar",
  MARMITARIA: "Marmitaria / refeições transportadas",
  RESTAURANTE: "Restaurante comercial",
};

const INTERVENCAO_LABELS: Record<TipoIntervencao, string> = {
  CONSTRUCAO_NOVA: "Construção nova",
  ADAPTACAO: "Adaptação de imóvel existente",
  REFORMA: "Reforma de cozinha existente",
};

const DISTRIBUICAO_LABELS: Record<ModeloDistribuicao, string> = {
  REFEITORIO: "Refeições servidas no refeitório",
  MARMITAS: "Marmitas / refeições embaladas",
  MISTO: "Misto",
};

const ENERGIA_LABELS: Record<FonteEnergia, string> = {
  GAS: "Gás",
  ELETRICA: "Elétrica",
  VAPOR: "Vapor / sistema central",
  MISTA: "Mista",
  A_DEFINIR: "A definir",
};

const ACABAMENTO_LABELS: Record<NivelAcabamento, string> = {
  PADRAO: "Padrão",
  ALTO: "Alto",
};

const GRUPO_PREP_LABELS: Record<string, string> = {
  PRAATO_FUNDAMENTO: "Prato fundamental",
  CARNE_OU_PROTEINA: "Carne / proteína",
  GUARNICAO: "Guarnição",
  SALADA: "Salada",
  SOBREMESA: "Sobremesa",
  BEBIDA: "Bebida",
  OUTRO: "Outro",
};

const FAMILIA_LABELS: Record<string, string> = {
  COCCAO: "Cocção",
  FORNO: "Forno",
  PREPARO: "Pré-preparo",
  LAVAGEM: "Lavagem de louças",
  REFRIGERACAO: "Refrigeração",
  DISTRIBUICAO: "Distribuição",
  BANCADA: "Bancadas",
  EXAUSTAO: "Exaustão",
  TRANSPORTE: "Transporte / estantes",
};

const UNIDADE_CAP_LABELS: Record<string, string> = {
  KG: "kg",
  REFEICAO: "refeições",
  LITRO: "L",
  M3H: "m³/h",
  M2: "m²",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function numbr(value: number, decimals = 2): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: decimals });
}

function numFromEvent(event: ChangeEvent<HTMLInputElement>): number {
  const value = event.target.valueAsNumber;
  return Number.isFinite(value) ? value : 0;
}

function nullableNumFromEvent(event: ChangeEvent<HTMLInputElement>): number | null {
  if (event.target.value === "") return null;
  const value = event.target.valueAsNumber;
  return Number.isFinite(value) ? value : null;
}

function updateAt<T>(list: T[], index: number, patch: Partial<T>): T[] {
  return list.map((item, index2) => (index2 === index ? { ...item, ...patch } : item));
}

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

export function OrcamentoView() {
  const [step, setStep] = useState(0);
  const [premissas, setPremissas] = useState<Premissas>(defaultPremissas);
  const [cardapio, setCardapio] = useState<Preparacao[]>(defaultCardapio);
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>(defaultEquipamentos);
  const [ambientes, setAmbientes] = useState<Ambiente[]>(defaultAmbientes);
  const [usosAgua, setUsosAgua] = useState<UsoAgua[]>(defaultUsosAgua);
  const [tabelaPrecos, setTabelaPrecos] = useState<Preco[]>(defaultTabelaPrecos);
  const [filtroPreco, setFiltroPreco] = useState("");
  const [estimate, setEstimate] = useState<BudgetEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setP = <K extends keyof Premissas>(key: K, value: Premissas[K]) =>
    setPremissas((current) => ({ ...current, [key]: value }));

  async function calcular() {
    setLoading(true);
    setError(null);
    try {
      const payload = estimateRequestSchema.parse({
        premissas,
        cardapio,
        equipamentos,
        ambientes,
        usosAgua,
        tabelaPrecos,
      });
      const { estimate: resultado } = await apiRequest<{ estimate: BudgetEstimate }>(
        "/api/v1/budget/estimate",
        { method: "POST", body: JSON.stringify(payload) }
      );
      setEstimate(resultado);
      setStep(5);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Falha ao calcular o orçamento. Tente novamente."
      );
    } finally {
      setLoading(false);
    }
  }

  function baixar(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const precosFiltrados = tabelaPrecos
    .map((preco, index) => ({ preco, index }))
    .filter(({ preco }) => {
      const busca = filtroPreco.trim().toLowerCase();
      if (!busca) return true;
      return (
        preco.codigo.toLowerCase().includes(busca) || preco.descricao.toLowerCase().includes(busca)
      );
    });

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex flex-wrap gap-2">
        {STEPS.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(index)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              index === step
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {index + 1}. {label}
          </button>
        ))}
      </nav>

      <ErrorBox message={error} />

      {step === 0 && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">1. Premissas e requisitos</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Dados que definem o projeto (memória de cálculo §1). O que ainda não for conhecido
            pode permanecer “a definir”.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <Field label="Capacidade diária (refeições/dia)">
              <input
                type="number"
                min={50}
                className={inputCls}
                value={premissas.capacidadeDiaria}
                onChange={(event) => setP("capacidadeDiaria", numFromEvent(event))}
              />
            </Field>
            <Field label="Horas efetivas de produção">
              <input
                type="number"
                min={1}
                step={0.5}
                className={inputCls}
                value={premissas.horasProducao}
                onChange={(event) => setP("horasProducao", numFromEvent(event))}
              />
            </Field>
            <Field label="Janela de pico para servir (h)">
              <input
                type="number"
                min={0.5}
                step={0.5}
                className={inputCls}
                value={premissas.janelaPicoHoras}
                onChange={(event) => setP("janelaPicoHoras", numFromEvent(event))}
              />
            </Field>
            <Field label="Tipo de cozinha">
              <select
                className={inputCls}
                value={premissas.tipoCozinha}
                onChange={(event) => setP("tipoCozinha", event.target.value as TipoCozinha)}
              >
                {Object.entries(TIPO_COZINHA_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tipo de intervenção">
              <select
                className={inputCls}
                value={premissas.tipoIntervencao}
                onChange={(event) =>
                  setP("tipoIntervencao", event.target.value as TipoIntervencao)
                }
              >
                {Object.entries(INTERVENCAO_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Modelo de distribuição">
              <select
                className={inputCls}
                value={premissas.modeloDistribuicao}
                onChange={(event) =>
                  setP("modeloDistribuicao", event.target.value as ModeloDistribuicao)
                }
              >
                {Object.entries(DISTRIBUICAO_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fonte de energia na cocção">
              <select
                className={inputCls}
                value={premissas.fonteEnergiaCoccao}
                onChange={(event) =>
                  setP("fonteEnergiaCoccao", event.target.value as FonteEnergia)
                }
              >
                {Object.entries(ENERGIA_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nível de acabamento">
              <select
                className={inputCls}
                value={premissas.nivelAcabamento}
                onChange={(event) =>
                  setP("nivelAcabamento", event.target.value as NivelAcabamento)
                }
              >
                {Object.entries(ACABAMENTO_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Área disponível no imóvel (m², se conhecida)">
              <input
                type="number"
                min={0}
                className={inputCls}
                value={premissas.areaDisponivelM2 ?? ""}
                onChange={(event) => setP("areaDisponivelM2", nullableNumFromEvent(event))}
              />
            </Field>
            <Field label="Município da obra">
              <input
                className={inputCls}
                value={premissas.municipio}
                onChange={(event) => setP("municipio", event.target.value)}
              />
            </Field>
            <Field label="UF">
              <input
                className={inputCls}
                maxLength={2}
                value={premissas.uf}
                onChange={(event) => setP("uf", event.target.value)}
              />
            </Field>
            <Field label="Data-base dos preços (AAAA-MM)">
              <input
                type="month"
                className={inputCls}
                value={premissas.dataBase}
                onChange={(event) => setP("dataBase", event.target.value)}
              />
            </Field>
            <Field label="Fator de custo local (1 = referência)">
              <input
                type="number"
                min={0.5}
                max={2}
                step={0.05}
                className={inputCls}
                value={premissas.fatorCustoLocal}
                onChange={(event) => setP("fatorCustoLocal", numFromEvent(event))}
              />
            </Field>
            <Field label="Custos indiretos (%)">
              <input
                type="number"
                min={0}
                max={50}
                step={0.5}
                className={inputCls}
                value={premissas.percentualIndiretos}
                onChange={(event) => setP("percentualIndiretos", numFromEvent(event))}
              />
            </Field>
            <Field label="Reserva de risco / contingência (%)">
              <input
                type="number"
                min={0}
                max={40}
                step={0.5}
                className={inputCls}
                value={premissas.percentualContingencia}
                onChange={(event) => setP("percentualContingencia", numFromEvent(event))}
              />
            </Field>
            <Field label="BDI (%)">
              <input
                type="number"
                min={0}
                max={60}
                step={0.5}
                className={inputCls}
                value={premissas.bdiPercentual}
                onChange={(event) => setP("bdiPercentual", numFromEvent(event))}
              />
            </Field>
            <div className="flex items-end gap-2 pb-1">
              <input
                id="turno-escalonado"
                type="checkbox"
                checked={premissas.turnoEscalonado}
                onChange={(event) => setP("turnoEscalonado", event.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <label htmlFor="turno-escalonado" className="text-sm">
                Distribuição escalonada / vários turnos
              </label>
            </div>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">2. Cardápio e fichas técnicas</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Porção pronta e rendimento por preparação (§2.1). Massa comprada = massa pronta ×
                fator de rendimento.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setCardapio((current) => [
                  ...current,
                  {
                    codigo: `PREP-${String(current.length + 1).padStart(2, "0")}`,
                    nome: "Nova preparação",
                    porcaoProntaG: 100,
                    quantidadeRefeicoes: premissas.capacidadeDiaria,
                    fatorRendimento: 1.1,
                    grupo: "OUTRO",
                  },
                ])
              }
            >
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-2 py-2">Código</th>
                  <th className="px-2 py-2">Preparação</th>
                  <th className="px-2 py-2">Grupo</th>
                  <th className="px-2 py-2">Porção pronta (g)</th>
                  <th className="px-2 py-2">Refeições</th>
                  <th className="px-2 py-2">Fator rend.</th>
                  <th className="px-2 py-2">Massa pronta (kg)</th>
                  <th className="px-2 py-2">Massa comprada (kg)</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {cardapio.map((preparacao, index) => {
                  const pronta = (preparacao.quantidadeRefeicoes * preparacao.porcaoProntaG) / 1000;
                  return (
                    <tr key={preparacao.codigo} className="border-b border-border last:border-0">
                      <td className="px-2 py-1.5">
                        <input
                          className={smallInputCls}
                          value={preparacao.codigo}
                          onChange={(event) =>
                            setCardapio((current) =>
                              updateAt(current, index, { codigo: event.target.value })
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          className={smallInputCls}
                          value={preparacao.nome}
                          onChange={(event) =>
                            setCardapio((current) =>
                              updateAt(current, index, { nome: event.target.value })
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          className={smallInputCls}
                          value={preparacao.grupo}
                          onChange={(event) =>
                            setCardapio((current) =>
                              updateAt(current, index, {
                                grupo: event.target.value as Preparacao["grupo"],
                              })
                            )
                          }
                        >
                          {Object.entries(GRUPO_PREP_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min={1}
                          className={smallInputCls}
                          value={preparacao.porcaoProntaG}
                          onChange={(event) =>
                            setCardapio((current) =>
                              updateAt(current, index, { porcaoProntaG: numFromEvent(event) })
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min={1}
                          className={smallInputCls}
                          value={preparacao.quantidadeRefeicoes}
                          onChange={(event) =>
                            setCardapio((current) =>
                              updateAt(current, index, {
                                quantidadeRefeicoes: Math.round(numFromEvent(event)),
                              })
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min={0.1}
                          step={0.05}
                          className={smallInputCls}
                          value={preparacao.fatorRendimento}
                          onChange={(event) =>
                            setCardapio((current) =>
                              updateAt(current, index, { fatorRendimento: numFromEvent(event) })
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5 text-xs text-muted-foreground">{numbr(pronta)}</td>
                      <td className="px-2 py-1.5 text-xs text-muted-foreground">
                        {numbr(pronta * preparacao.fatorRendimento)}
                      </td>
                      <td className="px-2 py-1.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            setCardapio((current) => current.filter((_, i) => i !== index))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">3. Equipamentos</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Capacidade útil, ciclo e preço (§4). Deixe a quantidade vazia para o sistema
                dimensionar; informe para travar. O PU já pode incluir frete e instalação em %.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setEquipamentos((current) => [
                  ...current,
                  {
                    codigo: `EQ-${String(current.length + 1).padStart(2, "0")}`,
                    familia: "COCCAO",
                    descricao: "Novo equipamento",
                    capacidadeUtil: 10,
                    unidadeCapacidade: "KG",
                    cicloMin: 30,
                    potenciaKW: 0,
                    consumoGasKW: 0,
                    demandaDia: null,
                    precoUnitario: 0,
                    percentualFrete: 4,
                    percentualInstalacao: 5,
                    quantidadeManual: null,
                  },
                ])
              }
            >
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-2 py-2">Código</th>
                  <th className="px-2 py-2">Família</th>
                  <th className="px-2 py-2">Descrição</th>
                  <th className="px-2 py-2">Cap. útil</th>
                  <th className="px-2 py-2">Unid.</th>
                  <th className="px-2 py-2">Ciclo (min)</th>
                  <th className="px-2 py-2">kW</th>
                  <th className="px-2 py-2">gás kW</th>
                  <th className="px-2 py-2">Qtd manual</th>
                  <th className="px-2 py-2">Preço (R$)</th>
                  <th className="px-2 py-2">Frete %</th>
                  <th className="px-2 py-2">Inst. %</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {equipamentos.map((equipamento, index) => (
                  <tr key={equipamento.codigo} className="border-b border-border last:border-0">
                    <td className="px-2 py-1.5">
                      <input
                        className={smallInputCls}
                        value={equipamento.codigo}
                        onChange={(event) =>
                          setEquipamentos((current) =>
                            updateAt(current, index, { codigo: event.target.value })
                          )
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        className={smallInputCls}
                        value={equipamento.familia}
                        onChange={(event) =>
                          setEquipamentos((current) =>
                            updateAt(current, index, {
                              familia: event.target.value as Equipamento["familia"],
                            })
                          )
                        }
                      >
                        {Object.entries(FAMILIA_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        className={smallInputCls}
                        value={equipamento.descricao}
                        onChange={(event) =>
                          setEquipamentos((current) =>
                            updateAt(current, index, { descricao: event.target.value })
                          )
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min={0.01}
                        step="any"
                        className={smallInputCls}
                        value={equipamento.capacidadeUtil}
                        onChange={(event) =>
                          setEquipamentos((current) =>
                            updateAt(current, index, { capacidadeUtil: numFromEvent(event) })
                          )
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        className={smallInputCls}
                        value={equipamento.unidadeCapacidade}
                        onChange={(event) =>
                          setEquipamentos((current) =>
                            updateAt(current, index, {
                              unidadeCapacidade: event.target
                                .value as Equipamento["unidadeCapacidade"],
                            })
                          )
                        }
                      >
                        {Object.entries(UNIDADE_CAP_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min={1}
                        className={smallInputCls}
                        value={equipamento.cicloMin ?? ""}
                        onChange={(event) =>
                          setEquipamentos((current) =>
                            updateAt(current, index, { cicloMin: nullableNumFromEvent(event) })
                          )
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className={smallInputCls}
                        value={equipamento.potenciaKW}
                        onChange={(event) =>
                          setEquipamentos((current) =>
                            updateAt(current, index, { potenciaKW: numFromEvent(event) })
                          )
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className={smallInputCls}
                        value={equipamento.consumoGasKW}
                        onChange={(event) =>
                          setEquipamentos((current) =>
                            updateAt(current, index, { consumoGasKW: numFromEvent(event) })
                          )
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min={1}
                        placeholder="auto"
                        className={smallInputCls}
                        value={equipamento.quantidadeManual ?? ""}
                        onChange={(event) =>
                          setEquipamentos((current) =>
                            updateAt(current, index, {
                              quantidadeManual: nullableNumFromEvent(event),
                            })
                          )
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className={smallInputCls}
                        value={equipamento.precoUnitario}
                        onChange={(event) =>
                          setEquipamentos((current) =>
                            updateAt(current, index, { precoUnitario: numFromEvent(event) })
                          )
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min={0}
                        max={50}
                        className={smallInputCls}
                        value={equipamento.percentualFrete}
                        onChange={(event) =>
                          setEquipamentos((current) =>
                            updateAt(current, index, { percentualFrete: numFromEvent(event) })
                          )
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min={0}
                        max={50}
                        className={smallInputCls}
                        value={equipamento.percentualInstalacao}
                        onChange={(event) =>
                          setEquipamentos((current) =>
                            updateAt(current, index, { percentualInstalacao: numFromEvent(event) })
                          )
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          setEquipamentos((current) => current.filter((_, i) => i !== index))
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          <section className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">4. Ambientes (programa de necessidades)</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Áreas por ambiente (§3.1) — ajuste ao layout do imóvel.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setAmbientes((current) => [
                    ...current,
                    {
                      codigo: `AMB-${String(current.length + 1).padStart(2, "0")}`,
                      nome: "Novo ambiente",
                      areaM2: 10,
                    },
                  ])
                }
              >
                <Plus className="h-4 w-4" /> Adicionar
              </Button>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="px-2 py-2">Código</th>
                    <th className="px-2 py-2">Ambiente</th>
                    <th className="px-2 py-2">Área (m²)</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {ambientes.map((ambiente, index) => (
                    <tr key={ambiente.codigo} className="border-b border-border last:border-0">
                      <td className="px-2 py-1.5">
                        <input
                          className={smallInputCls}
                          value={ambiente.codigo}
                          onChange={(event) =>
                            setAmbientes((current) =>
                              updateAt(current, index, { codigo: event.target.value })
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          className={smallInputCls}
                          value={ambiente.nome}
                          onChange={(event) =>
                            setAmbientes((current) =>
                              updateAt(current, index, { nome: event.target.value })
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min={0.1}
                          step="any"
                          className={smallInputCls}
                          value={ambiente.areaM2}
                          onChange={(event) =>
                            setAmbientes((current) =>
                              updateAt(current, index, { areaM2: numFromEvent(event) })
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            setAmbientes((current) => current.filter((_, i) => i !== index))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={2} className="px-2 py-2 text-xs font-medium text-muted-foreground">
                      Área total do programa
                    </td>
                    <td className="px-2 py-2 text-xs font-semibold">
                      {numbr(ambientes.reduce((total, ambiente) => total + ambiente.areaM2, 0))} m²
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Usos de água (§5.3)</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  V = Σ vazão × duração × ocorrências — alimenta as redes de água e esgoto.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setUsosAgua((current) => [
                    ...current,
                    {
                      codigo: `AG-${String(current.length + 1).padStart(2, "0")}`,
                      descricao: "Novo uso",
                      vazaoLmin: 10,
                      minutosPorOcorrencia: 30,
                      ocorrenciasDia: 2,
                    },
                  ])
                }
              >
                <Plus className="h-4 w-4" /> Adicionar
              </Button>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="px-2 py-2">Código</th>
                    <th className="px-2 py-2">Uso</th>
                    <th className="px-2 py-2">Vazão (L/min)</th>
                    <th className="px-2 py-2">Min/ocorrência</th>
                    <th className="px-2 py-2">Ocorrências/dia</th>
                    <th className="px-2 py-2">Volume (L/dia)</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {usosAgua.map((uso, index) => (
                    <tr key={uso.codigo} className="border-b border-border last:border-0">
                      <td className="px-2 py-1.5">
                        <input
                          className={smallInputCls}
                          value={uso.codigo}
                          onChange={(event) =>
                            setUsosAgua((current) =>
                              updateAt(current, index, { codigo: event.target.value })
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          className={smallInputCls}
                          value={uso.descricao}
                          onChange={(event) =>
                            setUsosAgua((current) =>
                              updateAt(current, index, { descricao: event.target.value })
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min={0.1}
                          step="any"
                          className={smallInputCls}
                          value={uso.vazaoLmin}
                          onChange={(event) =>
                            setUsosAgua((current) =>
                              updateAt(current, index, { vazaoLmin: numFromEvent(event) })
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min={0.1}
                          step="any"
                          className={smallInputCls}
                          value={uso.minutosPorOcorrencia}
                          onChange={(event) =>
                            setUsosAgua((current) =>
                              updateAt(current, index, { minutosPorOcorrencia: numFromEvent(event) })
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min={1}
                          className={smallInputCls}
                          value={uso.ocorrenciasDia}
                          onChange={(event) =>
                            setUsosAgua((current) =>
                              updateAt(current, index, {
                                ocorrenciasDia: Math.round(numFromEvent(event)),
                              })
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5 text-xs text-muted-foreground">
                        {numbr((uso.vazaoLmin * uso.minutosPorOcorrencia * uso.ocorrenciasDia))}
                      </td>
                      <td className="px-2 py-1.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            setUsosAgua((current) => current.filter((_, i) => i !== index))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {step === 4 && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">5. Preços unitários</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            PU por código de quantitativo (§6). Os valores padrão são referências ilustrativas —
            substitua por cotação local ou SINAPI antes de aprovar o orçamento.
          </p>
          <div className="mt-3 flex items-end gap-3">
            <Field label="Filtrar por código ou descrição">
              <input
                className={`${inputCls} md:w-72`}
                value={filtroPreco}
                onChange={(event) => setFiltroPreco(event.target.value)}
              />
            </Field>
          </div>
          <div className="mt-3 max-h-[32rem] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-2 py-2">Código</th>
                  <th className="px-2 py-2">Descrição</th>
                  <th className="px-2 py-2">Unid.</th>
                  <th className="px-2 py-2">PU (R$)</th>
                  <th className="px-2 py-2">Origem</th>
                  <th className="px-2 py-2">Data-base</th>
                </tr>
              </thead>
              <tbody>
                {precosFiltrados.map(({ preco, index }) => (
                  <tr key={preco.codigo} className="border-b border-border last:border-0">
                    <td className="px-2 py-1.5 font-mono text-xs">{preco.codigo}</td>
                    <td className="px-2 py-1.5">{preco.descricao}</td>
                    <td className="px-2 py-1.5 text-xs text-muted-foreground">{preco.unidade}</td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className={smallInputCls}
                        value={preco.pu}
                        onChange={(event) =>
                          setTabelaPrecos((current) =>
                            updateAt(current, index, { pu: numFromEvent(event) })
                          )
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        className={smallInputCls}
                        value={preco.fonte}
                        onChange={(event) =>
                          setTabelaPrecos((current) =>
                            updateAt(current, index, { fonte: event.target.value })
                          )
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="month"
                        className={smallInputCls}
                        value={preco.dataBase}
                        onChange={(event) =>
                          setTabelaPrecos((current) =>
                            updateAt(current, index, { dataBase: event.target.value })
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {step === 5 && (
        <section className="flex flex-col gap-4">
          {!estimate ? (
            <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-muted-foreground">
              Clique em “Calcular” para gerar o orçamento preliminar com as premissas informadas.
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-border bg-surface p-4">
                  <p className="text-xs uppercase text-muted-foreground">Custo direto</p>
                  <p className="mt-1 text-lg font-semibold">{brl(estimate.consolidacao.custoDireto)}</p>
                </div>
                <div className="rounded-lg border border-border bg-surface p-4">
                  <p className="text-xs uppercase text-muted-foreground">Indiretos + reserva + BDI</p>
                  <p className="mt-1 text-lg font-semibold">
                    {brl(
                      estimate.consolidacao.totalGeral -
                        estimate.consolidacao.custoBase +
                        estimate.consolidacao.contingencia +
                        estimate.consolidacao.bdi
                    )}
                  </p>
                </div>
                <div className="rounded-lg border border-primary/40 bg-surface p-4">
                  <p className="text-xs uppercase text-muted-foreground">Total geral</p>
                  <p className="mt-1 text-lg font-semibold text-primary">
                    {brl(estimate.consolidacao.totalGeral)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-surface p-4">
                  <p className="text-xs uppercase text-muted-foreground">Custo por refeição</p>
                  <p className="mt-1 text-lg font-semibold">
                    {brl(estimate.consolidacao.custoPorRefeicao)}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-surface p-4">
                <h3 className="text-sm font-semibold">Premissas do cálculo</h3>
                <div className="mt-2 grid gap-x-6 gap-y-1 text-xs md:grid-cols-3">
                  <p>
                    Capacidade: <strong>{numbr(estimate.premissas.capacidadeDiaria, 0)} refeições/dia</strong>
                  </p>
                  <p>
                    Distribuição: <strong>{numbr(estimate.dimensionamento.refeicoesPorHoraDistribuicao, 0)} ref/h</strong> em {numbr(estimate.dimensionamento.horasDistribuicao)} h
                  </p>
                  <p>
                    Área do programa: <strong>{numbr(estimate.dimensionamento.areaTotalM2)} m²</strong>
                  </p>
                  <p>
                    Massa pronta: <strong>{numbr(estimate.dimensionamento.massaTotalProntaKg)} kg/dia</strong>
                  </p>
                  <p>
                    Demanda elétrica: <strong>{numbr(estimate.dimensionamento.demandaEletricaKW)} kW</strong>
                  </p>
                  <p>
                    Exaustão: <strong>{numbr(estimate.dimensionamento.vazaoExaustaoM3h, 0)} m³/h</strong>
                  </p>
                  <p>
                    Água: <strong>{numbr(estimate.dimensionamento.aguaDiaM3)} m³/dia</strong>
                  </p>
                  <p>
                    Data-base: <strong>{estimate.premissas.dataBase}</strong>
                  </p>
                  <p>
                    Fator custo local: <strong>{numbr(estimate.premissas.fatorCustoLocal)}</strong>
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-surface p-4">
                <h3 className="text-sm font-semibold">Consolidação por grupo (§6.2)</h3>
                <table className="mt-2 w-full text-sm">
                  <tbody>
                    {[...new Set(estimate.quantitativos.map((linha) => linha.grupo))]
                      .sort((a, b) => a - b)
                      .map((grupo) => {
                        const total = estimate.quantitativos
                          .filter((linha) => linha.grupo === grupo)
                          .reduce((acc, linha) => acc + linha.custoTotal, 0);
                        return (
                          <tr key={grupo} className="border-b border-border last:border-0">
                            <td className="px-2 py-1.5 text-xs text-muted-foreground">{grupo}</td>
                            <td className="px-2 py-1.5">{GRUPOS_ORCAMENTO[grupo] ?? `Grupo ${grupo}`}</td>
                            <td className="px-2 py-1.5 text-right font-medium">{brl(total)}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                <div className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Custos indiretos ({numbr(estimate.consolidacao.percentuais.indiretos)}%)</span>
                    <span>{brl(estimate.consolidacao.custoIndireto)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Reserva de risco ({numbr(estimate.consolidacao.percentuais.contingencia)}%)</span>
                    <span>{brl(estimate.consolidacao.contingencia)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>BDI ({numbr(estimate.consolidacao.percentuais.bdi)}%)</span>
                    <span>{brl(estimate.consolidacao.bdi)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 font-semibold">
                    <span>Total geral</span>
                    <span>{brl(estimate.consolidacao.totalGeral)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-surface p-4">
                <h3 className="text-sm font-semibold">
                  Equipamentos dimensionados ({estimate.dimensionamento.equipamentos.length})
                </h3>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                        <th className="px-2 py-2">Código</th>
                        <th className="px-2 py-2">Família</th>
                        <th className="px-2 py-2">Descrição</th>
                        <th className="px-2 py-2">Qtd</th>
                        <th className="px-2 py-2">Origem</th>
                        <th className="px-2 py-2">Cap. projeto</th>
                        <th className="px-2 py-2">Custo total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {estimate.dimensionamento.equipamentos.map((equipamento) => (
                        <tr key={equipamento.codigo} className="border-b border-border last:border-0">
                          <td className="px-2 py-1.5 font-mono text-xs">{equipamento.codigo}</td>
                          <td className="px-2 py-1.5 text-xs">
                            {FAMILIA_LABELS[equipamento.familia] ?? equipamento.familia}
                          </td>
                          <td className="px-2 py-1.5">{equipamento.descricao}</td>
                          <td className="px-2 py-1.5">{equipamento.quantidade}</td>
                          <td className="px-2 py-1.5">
                            <Badge variant={equipamento.origemQuantidade === "DIMENSIONAMENTO" ? "success" : "secondary"}>
                              {equipamento.origemQuantidade}
                            </Badge>
                          </td>
                          <td className="px-2 py-1.5 text-xs">
                            {numbr(equipamento.capacidadeProjeto)}{" "}
                            {UNIDADE_CAP_LABELS[equipamento.unidadeCapacidade] ??
                              equipamento.unidadeCapacidade}
                          </td>
                          <td className="px-2 py-1.5">{brl(equipamento.custoTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-surface p-4">
                <h3 className="text-sm font-semibold">
                  Quantitativos e custos ({estimate.quantitativos.length} linhas)
                </h3>
                <div className="mt-2 max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                        <th className="px-2 py-2">Grupo</th>
                        <th className="px-2 py-2">Código</th>
                        <th className="px-2 py-2">Descrição</th>
                        <th className="px-2 py-2">Qtd</th>
                        <th className="px-2 py-2">Unid.</th>
                        <th className="px-2 py-2">PU</th>
                        <th className="px-2 py-2">Total</th>
                        <th className="px-2 py-2">Origem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {estimate.quantitativos.map((linha) => (
                        <tr key={linha.codigo} className="border-b border-border last:border-0">
                          <td className="px-2 py-1.5 text-xs text-muted-foreground">{linha.grupo}</td>
                          <td className="px-2 py-1.5 font-mono text-xs">{linha.codigo}</td>
                          <td className="px-2 py-1.5">
                            {linha.descricao}
                            {linha.detalhe && (
                              <span className="block text-xs text-muted-foreground">{linha.detalhe}</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5">{numbr(linha.quantidade)}</td>
                          <td className="px-2 py-1.5 text-xs text-muted-foreground">{linha.unidade}</td>
                          <td className="px-2 py-1.5">{brl(linha.pu)}</td>
                          <td className="px-2 py-1.5 font-medium">{brl(linha.custoTotal)}</td>
                          <td className="px-2 py-1.5">
                            <Badge variant={linha.origem === "DIMENSIONAMENTO" ? "success" : "secondary"}>
                              {linha.origem}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {estimate.avisos.length > 0 && (
                <div className="rounded-lg border border-warning/40 bg-warning/10 p-4">
                  <h3 className="text-sm font-semibold text-foreground">Avisos e pendências</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                    {estimate.avisos.map((aviso) => (
                      <li key={aviso}>{aviso}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() =>
                    baixar(
                      buildBudgetJson(estimate),
                      budgetFileName(estimate, "json"),
                      "application/json"
                    )}
                >
                  <Download className="h-4 w-4" /> Exportar JSON (entrada E08)
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    baixar(
                      buildBudgetCsv(estimate),
                      budgetFileName(estimate, "csv"),
                      "text/csv;charset=utf-8"
                    )}
                >
                  <Download className="h-4 w-4" /> Exportar CSV
                </Button>
              </div>
            </>
          )}
        </section>
      )}

      <div className="flex items-center justify-between">
        <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          <ChevronLeft className="h-4 w-4" /> Anterior
        </Button>
        {step < 4 && (
          <Button variant="outline" onClick={() => setStep((s) => s + 1)}>
            Próximo <ChevronRight className="h-4 w-4" />
          </Button>
        )}
        {step >= 0 && step <= 5 && (
          <Button onClick={() => void calcular()} disabled={loading}>
            <Calculator className="h-4 w-4" />
            {loading ? "Calculando…" : "Calcular"}
          </Button>
        )}
      </div>
    </div>
  );
}
