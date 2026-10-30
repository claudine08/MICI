# Suprimentos — fornecedores, requisições de compra, cotações e mapa comparativo (E14, Fatia 1)

> Fonte: código em `src/modules/procurement/`, `prisma/schema.prisma` (bloco
> Procurement), rotas `src/app/api/v1/.../procurement/*` e `src/app/api/v1/suppliers/*`,
> tela `src/app/(app)/projetos/[id]/suprimentos/page.tsx` + `src/components/procurement/procurement-view.tsx`.
> **Status: E14 Fatia 1 completo e em produção** (commit `2ea90bb`,
> deploy `mici-5w7tzxsmi-homeland1`, alias `mici-theta.vercel.app`, smoke verde,
> migration `20261030190000_phase15_procurement` aplicada no Neon em 30/10/2026).
> Escopo da Fatia 1: fornecedores, requisição de compra, cotação e mapa
> comparativo (equalização + seleção do vencedor + aprovação da requisição).
> Pedido de compra (PO) e recebimento ficam para a Fatia 2.

---

## 1. Os seis conceitos

| Conceito | Entidade | O que é | Código |
|---|---|---|---|
| **Fornecedor** | `Supplier` | Cadastro central (escopo da **organização**) de fornecedores homologados: razão social, CNPJ/CPF, categoria, contato, status. | `SP001`, `SP002`… |
| **Requisição de Compra** | `PurchaseRequest` | Pedido interno de aquisição vinculado a um projeto, com prioridade, data de necessidade e vínculos opcionais a WBS, atividade e item de custo. | `PR001`, `PR002`… |
| **Item da Requisição** | `PurchaseRequestItem` | Linha da requisição: descrição, quantidade, unidade, preço unitário estimado e total estimado. | — |
| **Cotação** | `Quotation` | Proposta comercial de um fornecedor para uma requisição, com itens precificados, frete, desconto e totais calculados. | `QT001`, `QT002`… |
| **Item da Cotação** | `QuotationItem` | Linha da cotação: descrição, quantidade, unidade, preço unitário, total, prazo e marca. Pode referenciar o item da requisição de origem. | — |
| **Mapa Comparativo** | `BidComparison` | Equalização das cotações de uma requisição: identifica menor preço, menor prazo, diferenças percentuais e registra a cotação vencedora com justificativa. | `BC001`, `BC002`… |

Relações:
- Organização **1 → N** Fornecedores (fornecedor é escopo da org, não do projeto).
- Projeto **1 → N** Requisições de Compra.
- Requisição **1 → N** Itens (cascade).
- Requisição **1 → N** Cotações (cascade).
- Requisição **1 → N** Mapas Comparativos (cascade).
- Cotação **N → 1** Fornecedor (`onDelete: Restrict` — não exclui fornecedor com cotação).
- Cotação **1 → N** Itens (cascade); item da cotação **N → 1** item da requisição (`SetNull`).
- Mapa Comparativo **N → 1** Cotação selecionada (`SetNull`).
- Requisição **N → 1** WBS / Atividade / Item de Custo (opcionais, `SetNull`).

---

## 2. Fluxo completo (visão geral)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ 0. FORNECEDOR (Supplier) — escopo da organização                           │
│    cadastrar razão social, CNPJ, categoria, contato → SPxxx, status ACTIVE  │
│    ACTIVE / BLOCKED / INACTIVE                                             │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │ "nova requisição" escolhe projeto
                                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ 1. REQUISIÇÃO DE COMPRA (PurchaseRequest) — status DRAFT ("Rascunho")       │
│    título, prioridade, data de necessidade, vínculos WBS/atividade/custo,  │
│    itens [{descrição, qtd, unidade, preço est.}] → PRxxx                    │
│    editável apenas em DRAFT/SUBMITTED                                      │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │ SUBMIT (exige ≥1 item)
                                ▼
                       SUBMITTED ("Aberta")
                                │ START_QUOTING (manual) ou criação de cotação
                                │ (avança automaticamente SUBMITTED → QUOTING)
                                ▼
                       QUOTING ("Em cotação")
                                │ FINISH_QUOTING (exige ≥1 cotação)
                                ▼
                       COMPARED ("Cotada")  ← mapa comparativo concluído
                                │ APPROVE (exige cotação selecionada no mapa)
                                ▼
                       APPROVED ("Aprovada")  (terminal para esta fatia)
                                │
       CANCEL (qualquer exceto APPROVED) ──► CANCELLED ──REOPEN──► DRAFT
       REJECT (SUBMITTED/COMPARED) ────────► REJECTED   ──REOPEN──► DRAFT
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ 2. COTAÇÃO (Quotation) — status DRAFT ("Rascunho")                          │
│    requisição + fornecedor ativo + itens precificados + frete + desconto     │
│    → QTxxx; totais calculados: itemsTotal + frete − desconto                 │
│    se a requisição estava SUBMITTED, avança automaticamente para QUOTING   │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │ SUBMIT (exige ≥1 item)
                                ▼
                       SUBMITTED ("Enviada")
                                │ SELECT ──► SELECTED ("Selecionada") — vencedora
                                │ REJECT ──► REJECTED ("Desqualificada")
                                │ CANCEL ──► CANCELLED
                                │ REOPEN ──► DRAFT (de SUBMITTED/CANCELLED/REJECTED)
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ 3. MAPA COMPARATIVO (BidComparison) — status DRAFT ("Em elaboração")        │
│    gerado a partir das cotações da requisição:                              │
│    • ordena por preço, identifica menor preço e menor prazo                  │
│    • calcula % de diferença em relação ao menor preço                       │
│    • pré-seleciona a cotação de menor preço                                 │
│    → BCxxx                                                                  │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │ COMPLETE (seleciona vencedora + justificativa)
                                ▼
                       COMPLETED ("Concluído")
                                │
                                ├── cotação vencedora → SELECTED
                                ├── demais cotações SUBMITTED/DRAFT → REJECTED
                                └── requisição → COMPARED
```

Fluxo recomendado na prática:
1. Cadastrar **fornecedores** (uma vez, reutilizável em todo o projeto/org).
2. Criar a **requisição de compra** com itens e estimativas.
3. **Enviar** a requisição (DRAFT → SUBMITTED) e **iniciar cotação** (→ QUOTING).
4. Registrar **cotações** dos fornecedores (cada cotação avança a requisição para QUOTING se ainda SUBMITTED).
5. **Submeter** as cotações (DRAFT → SUBMITTED).
6. **Finalizar a cotação** (QUOTING → COMPARED) — exige ≥1 cotação; em seguida gerar o **mapa comparativo**.
7. **Concluir o mapa** selecionando a vencedora e justificando: a vencedora vira SELECTED, as demais REJECTED e a requisição vira COMPARED.
8. **Aprovar** a requisição (COMPARED → APPROVED).

---

## 3. Máquinas de estados

### 3.1 Fornecedor (`engine.ts`)

| Status | Rótulo PT | Descrição |
|---|---|---|
| `ACTIVE` | Ativo | Pode receber cotações (`isSupplierActive` = true). |
| `BLOCKED` | Bloqueado | Não pode receber cotações. |
| `INACTIVE` | Inativo | Desativado (usado em vez de exclusão quando há cotações vinculadas). |

Sem transições formais: o status é alterado via `updateSupplier` (campo `status` no `updateSupplierSchema`).

### 3.2 Requisição de Compra (`engine.ts` + `requests.ts`)

| Status | Rótulo PT | Ações disponíveis | Editável? |
|---|---|---|---|
| `DRAFT` | Rascunho | `SUBMIT`, `CANCEL`, `REOPEN` (de cancelada/rejeitada) | sim |
| `SUBMITTED` | Aberta | `START_QUOTING`, `APPROVE`, `REJECT`, `CANCEL` | sim |
| `QUOTING` | Em cotação | `FINISH_QUOTING`, `CANCEL` | não |
| `COMPARED` | Cotada | `APPROVE`, `REJECT` | não |
| `APPROVED` | Aprovada | — (terminal nesta fatia) | não |
| `CANCELLED` | Cancelada | `REOPEN` (→ DRAFT) | não |
| `REJECTED` | Rejeitada | `REOPEN` (→ DRAFT) | não |

Regras adicionais gravadas no writer (`requests.ts`):
- `SUBMIT` exige ≥1 item (`itemCount > 0`); caso contrário `PROCUREMENT_INVALID_STATE`.
- `FINISH_QUOTING` exige ≥1 cotação (`quotationCount > 0`).
- `APPROVE` de requisição `COMPARED` exige cotação selecionada no mapa (`hasSelectedQuotation`); `SUBMITTED` pode ser aprovada diretamente.
- `REJECT` só em `SUBMITTED` ou `COMPARED`.
- `CANCEL` não é permitido em `APPROVED`; requisição já cancelada não cancela de novo.
- `REOPEN` apenas de `CANCELLED` ou `REJECTED` → volta a `DRAFT`.
- Edição (`updatePurchaseRequest`) **só em `DRAFT`/`SUBMITTED`** (`isPurchaseRequestEditable`); fora disso → `PROCUREMENT_INVALID_STATE`.
- Exclusão lógica (`deletePurchaseRequest`) **só em `DRAFT`/`CANCELLED`** e sem cotações vinculadas.
- `isPurchaseRequestOpen`: aberta = tudo exceto `APPROVED`/`CANCELLED`/`REJECTED`.
- `isPurchaseRequestOverdue`: data de necessidade (DATE) anterior a hoje **e** requisição aberta.

### 3.3 Cotação (`engine.ts` + `quotations.ts`)

| Status | Rótulo PT | Ações disponíveis | Editável? |
|---|---|---|---|
| `DRAFT` | Rascunho | `SUBMIT`, `CANCEL` | sim |
| `SUBMITTED` | Enviada | `SELECT`, `REJECT`, `CANCEL`, `REOPEN` (→ DRAFT) | não |
| `SELECTED` | Selecionada | — (vencedora) | não |
| `REJECTED` | Desqualificada | `REOPEN` (→ DRAFT) | não |
| `CANCELLED` | Cancelada | `REOPEN` (→ DRAFT) | não |

Regras do writer (`quotations.ts`):
- Criação exige requisição existente e não `CANCELLED`/`REJECTED`/`APPROVED`.
- Fornecedor deve existir na organização e estar `ACTIVE` (`isSupplierActive`); caso contrário `VALIDATION_ERROR`.
- `SUBMIT` exige ≥1 item precificado.
- `SELECT`/`REJECT` apenas em `SUBMITTED`.
- `CANCEL` de cotação já cancelada é bloqueado.
- Edição (`updateQuotation`) **só em `DRAFT`** (`isQuotationEditable`); fora disso → `PROCUREMENT_INVALID_STATE`.
- Exclusão lógica (`deleteQuotation`) **só em `DRAFT`/`CANCELLED`**.
- Totais: `itemsTotal = Σ(qtd × preço unit.)`; `totalAmount = max(0, itemsTotal + frete − desconto)`, arredondado a 2 casas.
- Ao criar uma cotação com a requisição em `SUBMITTED`, a requisição avança automaticamente para `QUOTING`.

### 3.4 Mapa Comparativo (`engine.ts` + `comparisons.ts`)

| Status | Rótulo PT | Descrição |
|---|---|---|
| `DRAFT` | Em elaboração | Rascunho gerado a partir das cotações. |
| `COMPLETED` | Concluído | Vencedora selecionada; requisição avança para `COMPARED`. |
| `CANCELLED` | Cancelado | Cancelado. |

`analyzeBidComparison` (puro):
- Ordena as cotações por `totalAmount` (crescente) → `priceRank`.
- Identifica a de **menor preço** (`lowestPriceQuotationId`/`lowestPrice`).
- Identifica a de **menor prazo** entre as com `leadTimeDays > 0` (`fastestLeadTimeQuotationId`/`fastestLeadTimeDays`).
- Calcula `differenceFromLowestPercent = ((total − menor) / menor) × 100` (1 casa decimal).
- Marca `isLowestPrice` e `isFastest`.

Regras do writer (`comparisons.ts`):
- `createOrUpdateBidComparison` gera/atualiza o rascunho a partir das cotações da requisição; pré-seleciona a de menor preço (`selectedQuotationId` default = `lowestPriceQuotationId`).
- `completeBidComparison` (transação):
  1. Cotação selecionada → `SELECTED`.
  2. Demais cotações `SUBMITTED`/`DRAFT` → `REJECTED`.
  3. Cria/atualiza o `BidComparison` como `COMPLETED` (`completedAt`, `completedById`).
  4. Requisição de compra → `COMPARED`.
- A cotação selecionada deve pertencer à requisição (validação `VALIDATION_ERROR` caso contrário).

---

## 4. Regras de negócio (gravadas nos writers)

**Fornecedor (`suppliers.ts`)**
- Idempotência por `clientUuid`: reenvio com o mesmo `clientUuid` devolve o fornecedor já criado.
- Código sequencial `SP001`, `SP002`… por organização (`nextProcurementCode`).
- Código explícito informado é validado contra duplicidade na organização (CONFLICT).
- Exclusão lógica (`deletedAt`/`deletedBy`) bloqueada se houver cotações vinculadas (CONFLICT) — orienta-se desativar (status `INACTIVE`).
- Atualização de status/metadados incrementa `version`.

**Requisição de Compra (`requests.ts`)**
- Idempotência por `clientUuid` (escopo do projeto).
- Código sequencial `PR001`… por projeto.
- `assertProcurementProject`: projeto deve existir e pertencer à organização (tenant).
- `assertFieldLinks`: valida WBS/atividade contra o projeto/organização.
- `costItemId` validado contra o projeto.
- Itens criados em transação; na edição, itens são recriados (deleteMany + createMany).
- Toda escrita gera `AuditEvent` (CREATE/UPDATE/DELETE/STATUS_CHANGE) e `DomainEvent` (`PurchaseRequest.Created`, `.StatusChanged`).

**Cotação (`quotations.ts`)**
- Idempotência por `clientUuid` (escopo do projeto).
- Código sequencial `QT001`… por projeto.
- Valida requisição (não cancelada/rejeitada/aprovada) e fornecedor ativo.
- Totais recalculados em create e update (incluindo frete e desconto).
- Ao criar cotação com requisição `SUBMITTED`, avança a requisição para `QUOTING`.
- Toda escrita gera `AuditEvent` e `DomainEvent` (`Quotation.Created`).

**Mapa Comparativo (`comparisons.ts`)**
- `createOrUpdateBidComparison` cria (BCxxx) ou atualiza o rascunho, recalculando a análise a partir das cotações atuais da requisição.
- Idempotência por `clientUuid` no create.
- `completeBidComparison` é transacional e avança cotação/requisição.
- Toda escrita gera `AuditEvent` (CREATE/UPDATE/COMPLETE) e `DomainEvent` (`BidComparison.Completed`).

**Transversal (`common.ts`)**
- Escopo de tenant sempre validado (`assertProcurementProject`).
- Códigos automáticos por escopo: `SP` (organização), `PR`/`QT`/`BC` (projeto) — sequencial de 3 dígitos.
- Auditoria com `projectId` opcional (fornecedor é escopo da org).
- Domain events com `projectId` opcional.
- `ActorContext` reutilizado do módulo de campo.

---

## 5. API (14 rotas)

Base: `/api/v1/projects/[id]/procurement/…` (exceto fornecedores em `/api/v1/suppliers/…`).
Padrão `apiHandler` + `actorOf` + `idsFrom`/`projectIdFrom`, mesmo padrão do módulo de campo.
Permissões: `PROCUREMENT:VIEW/CREATE/EDIT/APPROVE/REJECT/DELETE`.

| Método | Rota | Permissão | Função |
|---|---|---|---|
| GET | `/api/v1/suppliers` | `PROCUREMENT:VIEW` | lista fornecedores da organização |
| POST | `/api/v1/suppliers` | `PROCUREMENT:CREATE` | cria fornecedor (`SPxxx`) |
| GET | `/api/v1/suppliers/[supplierId]` | `PROCUREMENT:VIEW` | detalhe (com últimas 10 cotações) |
| PATCH | `/api/v1/suppliers/[supplierId]` | `PROCUREMENT:EDIT` | edita metadados/status |
| DELETE | `/api/v1/suppliers/[supplierId]` | `PROCUREMENT:DELETE` | exclusão lógica (se sem cotações) |
| GET | `/api/v1/projects/[id]/procurement/requests` | `PROCUREMENT:VIEW` | lista (`?status=`, `?costCenter=`, `?wbsNodeId=`) |
| POST | `/api/v1/projects/[id]/procurement/requests` | `PROCUREMENT:CREATE` | cria requisição (`PRxxx`) |
| GET | `/api/v1/projects/[id]/procurement/requests/[requestId]` | `PROCUREMENT:VIEW` | detalhe (itens, WBS, atividade, custo, cotações, mapa) |
| PATCH | `/api/v1/projects/[id]/procurement/requests/[requestId]` | `PROCUREMENT:EDIT` | edita (só DRAFT/SUBMITTED) |
| DELETE | `/api/v1/projects/[id]/procurement/requests/[requestId]` | `PROCUREMENT:DELETE` | exclusão lógica (só DRAFT/CANCELLED, sem cotações) |
| POST | `/api/v1/projects/[id]/procurement/requests/[requestId]/status` | `PROCUREMENT:APPROVE` (APPROVE) / `REJECT` (REJECT) / `EDIT` (demais) | transição de status |
| GET | `/api/v1/projects/[id]/procurement/requests/[requestId]/comparison` | `PROCUREMENT:VIEW` | gera/atualiza rascunho do mapa (`BCxxx`) |
| POST | `/api/v1/projects/[id]/procurement/requests/[requestId]/comparison/complete` | `PROCUREMENT:EDIT` | conclui o mapa (seleciona vencedora) |
| GET | `/api/v1/projects/[id]/procurement/quotations` | `PROCUREMENT:VIEW` | lista (`?requestId=`, `?supplierId=`) |
| POST | `/api/v1/projects/[id]/procurement/quotations` | `PROCUREMENT:CREATE` | cria cotação (`QTxxx`) |
| GET | `/api/v1/projects/[id]/procurement/quotations/[quotationId]` | `PROCUREMENT:VIEW` | detalhe |
| PATCH | `/api/v1/projects/[id]/procurement/quotations/[quotationId]` | `PROCUREMENT:EDIT` | edita (só DRAFT) |
| DELETE | `/api/v1/projects/[id]/procurement/quotations/[quotationId]` | `PROCUREMENT:DELETE` | exclusão lógica (só DRAFT/CANCELLED) |
| POST | `/api/v1/projects/[id]/procurement/quotations/[quotationId]/status` | `PROCUREMENT:EDIT` | transição (SUBMIT/SELECT/REJECT/CANCEL/REOPEN) |
| GET | `/api/v1/projects/[id]/procurement/summary` | `PROCUREMENT:VIEW` | resumo do quadro (board) |

Contrato de erro padrão: `{ error: { code, message, details?, correlation_id } }`.

---

## 6. Telas

- **`/suprimentos`** — visão geral por projeto: contagem de requisições, em cotação, cotadas, aprovadas e fornecedores homologados; link para a tela do projeto.
- **`/projetos/[id]/suprimentos`** — página principal (`procurement-view.tsx`), server-side com os selectors.
- Sidebar: item **"Suprimentos"** (ícone `ShoppingCart`); link "Suprimentos (E14)" no cabeçalho do projeto.

Componentes da tela:
- **Quadro**: Requisições · Abertas · Em cotação · Cotadas/Comp. · Aprovadas · Fornecedores Ativos.
- **Aba Requisições**: tabela com código, título, prioridade, status, necessidade, itens, cotações; ações Enviar / Iniciar Cotação / Aprovar / Ver itens; diálogo de criação com itens dinâmicos, prioridade, vínculos WBS/atividade/custo.
- **Aba Cotações**: tabela com código, requisição, fornecedor, prazo, pagamento, total, status; ação Submeter; diálogo de criação com itens precificados, frete e desconto.
- **Aba Mapa Comparativo**: seleção de requisição; tabela equalizada (fornecedor, cotação, prazo, condições, frete, desconto, total, diferença %, seleção por radio); destaque da menor preço; conclusão com justificativa.
- **Aba Fornecedores**: cards com código, status, nome, fantasia, CNPJ, categoria, e-mail/telefone; diálogo de cadastro.

---

## 7. Limitações conhecidas (hoje)

1. **Sem pedido de compra (PO) e recebimento** — a Fatia 1 fecha em `APPROVED` na requisição; PO/recebimento/inspeção de recebimento ficam para a Fatia 2.
2. **Edição de requisição bloqueada após SUBMITTED avançado** — requisição só é editável em `DRAFT`/`SUBMITTED`; itens não podem ser alterados em cotação.
3. **Cotação bloqueada após submissão** — edição só em `DRAFT`.
4. **Um mapa comparativo por requisição** — `getBidComparisonByRequestId` retorna o primeiro; `completeBidComparison` reutiliza o existente.
5. **Conclusão do mapa não valida justificativa mínima no backend além do zod** (`min(5)` caracteres) — textos curtos passam.
6. **Exclusão de fornecedor com cotações vinculadas é bloqueada** — desativar via status é o caminho.
7. **Código sequencial não é atômico** — concorrência pode gerar duplicidade (mitigada pelo unique constraint, que retorna CONFLICT).
8. **`leadTimeDays: 0` é válido** — corrigido para não ser convertido em `null`.

---

## 8. Próximo passo

**E14 Fatia 2**: Pedido de Compra (PO) e recebimento — vincular a requisição aprovada a um PO, controle de entrega/recebimento, inspeção de recebimento e integração com estoque/custos. Ainda não iniciado.

---

## 9. Verificação (gate da Fatia 1)

- `eslint` 0 problemas · `tsc --noEmit` limpo.
- **263 testes unitários** (`tests/unit/procurement-engine.test.ts` — máquina de estados de requisição e cotação, cálculo de totais, análise de bid comparison, board summary).
- **285 testes de integração** (`tests/integration/procurement.test.ts` — fornecedores com idempotência e isolamento de tenant, requisições com idempotência e transições, cotações com avanço automático para QUOTING, mapa comparativo completo, aprovação, restrições de exclusão, board).
- Migration `20261030190000_phase15_procurement` (enums `SupplierStatus`, `PurchaseRequestStatus`, `QuotationStatus`, `BidComparisonStatus` + tabelas `suppliers`, `purchase_requests`, `purchase_request_items`, `quotations`, `quotation_items`, `bid_comparisons` + FKs) — aplicada localmente (dev e `mici_test`) e no Neon.
- Deploy: commit `2ea90bb` → `mici-5w7tzxsmi-homeland1` (alias `mici-theta.vercel.app`), smoke verde nas rotas de suprimentos e fornecedores.
- Documentação: `suprimentos.md` (este arquivo), entrada em `DIARIO.md`, status em `ROADMAP.md`, estado em `devcurrent.md`.

> Detalhamento diário em [`DIARIO.md`](DIARIO.md) (seção "30/10/2026 — E14 Procurement, Fatia 1").