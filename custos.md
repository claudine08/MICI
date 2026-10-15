# Módulo de Custos (E08)

Visão geral de como o módulo de custos funciona, com foco em como os valores
são extraídos do JSON exportado pela calculadora de orçamento (`/orcamento`).

---

## 1. Três entidades

O custo de um projeto vive em três tabelas, todas escopadas por
`organizationId` (isolamento de tenant) e auditáveis:

| Entidade | O que é | Código |
|---|---|---|
| **CostItem** | Linha do orçamento — o que será comprado/executado. `amount` é derivado (`quantity × unitPrice`) e persistido para agregar. | `ORC001`, `ORC002`… (import) ou `CI001`… (manual) |
| **CostCommitment** | Compromisso firmado (contrato / PO) que consomem o orçamento. Pode apontar para um item. | `CC001`… |
| **CostActual** | Valor efetivamente pago/incorrido. Pode apontar para item e/ou compromisso. | `CA001`… |

---

## 2. Extração do JSON (`/orcamento` → custos)

O JSON vem do export da calculadora. O caminho é:

```
/orcamento (calculadora stateless)
      │  exporta BudgetEstimate (JSON)
      ▼
POST /api/v1/projects/[id]/cost/import-estimate
      │  valida com Zod → replace-all
      ▼
CostItem (ORC001, ORC002…)   →  BAC
```

### 2.1 Formato aceito

A API aceita um objeto com o array `quantitativos` (mín. 1, máx. 2000). Cada
linha tem os campos abaixo, que são mapeados direto para o `CostItem`:

| Campo do JSON | Vira no CostItem | Observação |
|---|---|---|
| `quantidade` | `quantity` | número ≥ 0 |
| `pu` | `unitPrice` | preço unitário |
| `custoTotal` | `amount` | **gravado direto, não recalculado** |
| `descricao` | `description` | truncado em 300 |
| `grupo` + `grupoNome` | `category` | concatenado, ex. `"3-Refrigeração"` |
| `unidade` | `unit` | truncado em 16 |
| `origem` | `origin` | default `"ESTIMATE"` |
| `fontePreco` | `fontePreco` | fonte do preço (SINAPI, cotação…) |

> Ponto importante: o `amount` vem do `custoTotal` pronto do JSON. O módulo
> **não** recalcula `quantidade × pu` — o export já traz o valor consolidado
> (que pode ter fator de custo local aplicado).

### 2.3 Custo direto ≠ custo total do projeto

Os itens importados são **custos diretos** — a obra em si, linha a linha:

```
custoTotal da linha = pu × quantidade × fator de custo local
```

O que entra nos `CostItem` (e portanto no **BAC** do EVM) é apenas essa soma
de custos diretos. Os demais elementos da consolidação do orçamento
**não** são itens de custo e ficam fora do módulo:

| Elemento da consolidação | Entra nos CostItem? |
|---|---|
| **Custo direto** (Σ linhas) | ✅ Sim — vira `amount` de cada item |
| Custo indireto (administração, seguros…) | ❌ Não |
| Contingência (reserva de risco) | ❌ Não |
| BDI (encargos e lucro) | ❌ Não |
| **Total geral** | ❌ Não — é comercial, não de obra |

Ou seja: o **BAC ≈ custo direto**, não o "total geral" do orçamento. O
preview da importação mostra o custo direto justamente por isso.

### 2.2 Replace-all

A importação substitui todos os itens vivos do projeto (mesmo princípio do
import de cronograma), dentro de uma única transação:

1. Soft-delete dos itens vivos (`deletedAt`/`deletedBy` — nunca apaga físico).
2. Cria um `CostItem` por linha, na ordem do array, com código `ORC001`…
3. Registra auditoria (`IMPORT_ESTIMATE`) e domain event
   (`Cost.EstimateImported`).

O total direto (`Σ custoTotal`) é calculado e devolvido na resposta.

---

## 3. EVM — desempenho de custo

O motor (`engine.ts`, puro, sem I/O) combina o custo com o progresso do
cronograma:

| Indicador | Fórmula |
|---|---|
| **BAC** | Σ `amount` dos itens (= custo **direto** total do orçamento) |
| **AC** | Σ `amount` dos actuals (o que já saiu do caixa) |
| **EV** | Σ `amount × progresso físico` (média do `physicalProgress` das atividades do nó WBS do item) |
| **PV** | Σ `amount × progresso planejado` (fração da duração decorrida até a data de corte) |
| **CPI** | `EV / AC` |
| **SPI** | `EV / PV` |
| **EAC** | `BAC / CPI` (ou `AC + (BAC − EV)` sem CPI, ou `BAC` sem AC) |

Dois comportamentos que evitam números falsos:

- Item **sem vínculo WBS** não entra em EV nem PV — não há como saber o
  progresso nem a base temporal. Contribui 0.
- **CPI/SPI viram `null`** quando o denominador é 0 (sem AC ou sem PV).

---

## 4. Baseline e gate G4

- **Baseline de custo** congela o orçamento (snapshot com `totalBudget`,
  `itemCount` e os itens). Aprovada é imutável (`BASELINE_IMMUTABLE`).
- **Gate G4** ("Contrato e plano") exige uma baseline COST aprovada para
  aprovar. Sem ela a API devolve `COST_BASELINE_REQUIRED` (409). Projetos
  ainda sem itens de custo não são bloqueados.

---

## 5. UI

- `/projetos/[id]/custos` — detalhe do projeto: cards de EVM, tabelas de
  itens / compromissos / realizados / baselines, CRUD e importação.
- `/custos` — visão de portfólio: uma linha por projeto (itens, orçamento,
  comprometido, realizado).

A importação na UI aceita **arquivo `.json`** (extração automática) ou
colagem direta, com preview do total e do número de linhas antes de
confirmar.
