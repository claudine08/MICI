# Suprimentos — fornecedores, requisições de compra, cotações e mapa comparativo (E14)

> Fonte: código em `src/modules/procurement/`, `prisma/schema.prisma` (bloco
> Procurement), rotas `src/app/api/v1/.../procurement/*` e `src/app/api/v1/suppliers/*`,
> telas `src/app/(app)/suprimentos/page.tsx` e `src/app/(app)/projetos/[id]/suprimentos/page.tsx`.
> **Status: E14 Fatia 1 completo e em produção** (commit `2ea90bb`,
> deploy `mici-5w7tzxsmi-homeland1`, smoke verde, migration `phase15_procurement`
> no Neon). A **Fatia 2** (Pedido de Compra / PO e recebimento) ainda não foi
> iniciada — o fluxo end-to-end completo está descrito abaixo, com a Fatia 2
> marcada como planejada.

---

## 1. Visão geral do processo (end-to-end)

O módulo de Suprimentos (E14, RF-019) cobre todo o ciclo de aquisição de um
projeto, da identificação da necessidade até o fechamento financeiro. A Fatia 1
entregue cobre da **necessidade** à **aprovação da requisição** (escolha do
fornecedor vencedor). A Fatia 2 cobrirá do **pedido de compra** ao
**recebimento e fechamento**.

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                            FLUXO END-TO-END DE SUPRIMENTOS                          │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  FATIA 1 (em produção)                                                              │
│  ─────────────────────                                                              │
│                                                                                      │
│  [0] FORNECEDORES (cadastro central da organização)                                 │
│       │                                                                             │
│       ▼                                                                             │
│  [1] NECESSIDADE → REQUISIÇÃO DE COMPRA (PR)                                        │
│       • identifica o que comprar, quanto, para quando, para qual WBS/atividade       │
│       • status DRAFT → SUBMITTED → (QUOTING) → COMPARED → APPROVED                  │
│       │                                                                             │
│       ▼                                                                             │
│  [2] COTAÇÃO (QT) — propostas dos fornecedores                                      │
│       • cada fornecedor envia preços, prazos e condições                            │
│       • status DRAFT → SUBMITTED → SELECTED / REJECTED                              │
│       │                                                                             │
│       ▼                                                                             │
│  [3] MAPA COMPARATIVO (BC) — equalização                                            │
│       • compara preços, prazos e condições; destaca menor preço/prazo               │
│       • status DRAFT → COMPLETED (seleciona vencedora)                              │
│       │                                                                             │
│       ▼                                                                             │
│  [4] APROVAÇÃO DA REQUISIÇÃO                                                        │
│       • gestor aprova a requisição com a cotação vencedora                          │
│       • status COMPARED → APPROVED                                                  │
│                                                                                      │
│  FATIA 2 (planejada — PO e recebimento)                                             │
│  ──────────────────────────────────────                                             │
│                                                                                      │
│  [5] PEDIDO DE COMPRA (PO) — emitido a partir da requisição aprovada                │
│       • formaliza a compra com o fornecedor vencedor                                 │
│       • status DRAFT → ISSUED → (parcialmente/totalmente recebido)                  │
│       │                                                                             │
│       ▼                                                                             │
│  [6] RECEBIMENTO (GR) — entrada de material/serviço                                 │
│       • conferência de quantidade, qualidade e prazo                                 │
│       • inspeção de recebimento (vinculada à Qualidade E13)                          │
│       │                                                                             │
│       ▼                                                                             │
│  [7] FECHAMENTO FINANCEIRO                                                          │
│       • medição de avanço, commitment de custo, fatura                              │
│       • encerramento do PO                                                          │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Os conceitos (entidades)

### Fatia 1 (implementada)

| Conceito | Entidade | O que é | Código |
|---|---|---|---|
| **Fornecedor** | `Supplier` | Cadastro central (escopo da **organização**) de fornecedores homologados: razão social, CNPJ/CPF, categoria, contato, status. | `SP001`, `SP002`… |
| **Requisição de Compra** | `PurchaseRequest` | Pedido interno de aquisição vinculado a um projeto, com prioridade, data de necessidade e vínculos opcionais a WBS, atividade e item de custo. | `PR001`, `PR002`… |
| **Item da Requisição** | `PurchaseRequestItem` | Linha da requisição: descrição, quantidade, unidade, preço unitário estimado e total estimado. | — |
| **Cotação** | `Quotation` | Proposta comercial de um fornecedor para uma requisição, com itens precificados, frete, desconto e totais calculados. | `QT001`, `QT002`… |
| **Item da Cotação** | `QuotationItem` | Linha da cotação: descrição, quantidade, unidade, preço unitário, total, prazo e marca. Pode referenciar o item da requisição de origem. | — |
| **Mapa Comparativo** | `BidComparison` | Equalização das cotações de uma requisição: identifica menor preço, menor prazo, diferenças percentuais e registra a cotação vencedora com justificativa. | `BC001`, `BC002`… |

### Fatia 2 (planejada)

| Conceito | Entidade (prevista) | O que é | Código (previsto) |
|---|---|---|---|
| **Pedido de Compra** | `PurchaseOrder` | Documento formal emitido ao fornecedor vencedor, com itens, quantidades, preços, prazo e condições. Nasce a partir de uma requisição `APPROVED`. | `PO001`, `PO002`… |
| **Item do Pedido** | `PurchaseOrderItem` | Linha do pedido: descrição, quantidade, unidade, preço unitário, total, vínculo ao item da requisição/cotação. | — |
| **Recebimento** | `GoodsReceipt` | Registro de entrada de material/serviço contra o pedido: quantidade recebida, data, responsável, inspeção. | `GR001`, `GR002`… |
| **Item do Recebimento** | `GoodsReceiptItem` | Linha do recebimento: quantidade recebida, quantidade rejeitada, observação, vínculo ao item do pedido. | — |

Relações da Fatia 1 (implementadas):
- Organização **1 → N** Fornecedores (fornecedor é escopo da org, não do projeto).
- Projeto **1 → N** Requisições de Compra.
- Requisição **1 → N** Itens (cascade).
- Requisição **1 → N** Cotações (cascade).
- Requisição **1 → N** Mapas Comparativos (cascade).
- Cotação **N → 1** Fornecedor (`onDelete: Restrict` — não exclui fornecedor com cotação).
- Cotação **1 → N** Itens (cascade); item da cotação **N → 1** item da requisição (`SetNull`).
- Mapa Comparativo **N → 1** Cotação selecionada (`SetNull`).
- Requisição **N → 1** WBS / Atividade / Item de Custo (opcionais, `SetNull`).

Relações da Fatia 2 (previstas):
- Requisição `APPROVED` **1 → 1 (ou N)** Pedido de Compra.
- Pedido **1 → N** Itens; **1 → N** Recebimentos.
- Recebimento **N → 1** Pedido; **1 → N** Itens.
- Recebimento **N → 1** Inspeção (Qualidade E13) para inspeção de recebimento.

---

## 3. Fluxo detalhado passo a passo

### Etapa 0 — Fornecedores (cadastro central)

**Quem:** Comprador / equipe de suprimentos (papel `PROCUREMENT` ou superior).

**O que acontece:**
1. Acessa a aba **Fornecedores** na tela de Suprimentos do projeto (ou a lista global em `/suprimentos`).
2. Cadastra o fornecedor: razão social (obrigatório), nome fantasia, CNPJ/CPF, categoria (Materiais, Serviços, Equipamentos, Empreiteiro, Projetos, Outros), e-mail, telefone, contato comercial, endereço, observações.
3. O sistema gera o código `SP001`, `SP002`… automaticamente (escopo da organização) e define o status inicial `ACTIVE`.
4. O fornecedor pode ser **bloqueado** (`BLOCKED`) ou **inativado** (`INACTIVE`) a qualquer momento via edição; fornecedores com cotações vinculadas não podem ser excluídos (apenas inativados).

**Regras:**
- Idempotência por `clientUuid`: reenvio do mesmo `clientUuid` devolve o fornecedor já criado (suporta fila offline).
- Código explícito informado é validado contra duplicidade na organização.
- Exclusão lógica (`deletedAt`) bloqueada se houver cotações vinculadas (`CONFLICT`).

**Saída:** base de fornecedores homologados disponível para todos os projetos da organização.

---

### Etapa 1 — Necessidade → Requisição de Compra (PR)

**Quem:** Engenheiro, coordenador de obra ou gestor de projeto.

**O que acontece:**
1. Identifica a necessidade de compra (material, serviço, equipamento) e acessa a aba **Requisições de Compra**.
2. Cria a requisição informando:
   - **Título** (obrigatório) e descrição/especificação.
   - **Prioridade** (LOW/MEDIUM/HIGH/CRITICAL, padrão MEDIUM).
   - **Data de necessidade** (prazo de entrega desejado).
   - **Vínculos opcionais**: nó da WBS, atividade do cronograma, centro de custo, item de custo (para integração com o módulo de Custos).
   - **Itens** (≥1): descrição, quantidade, unidade, preço unitário estimado (calcula o total estimado).
3. O sistema gera o código `PR001`, `PR002`… (escopo do projeto) e define o status inicial `DRAFT` (Rascunho).
4. A requisição pode ser editada livremente enquanto estiver em `DRAFT` ou `SUBMITTED`.

**Transições:**
- `DRAFT → SUBMITTED` via ação **Enviar** (exige ≥1 item). A partir daqui a requisição está "aberta" e pode receber cotações.
- `SUBMITTED → QUOTING` via ação **Iniciar Cotação** (manual) **ou automaticamente** ao registrar a primeira cotação.

**Regras:**
- Idempotência por `clientUuid` (escopo do projeto).
- `assertProcurementProject`: o projeto deve existir e pertencer à organização (tenant).
- `assertFieldLinks`: WBS e atividade validados contra o projeto/organização.
- `costItemId` validado contra o projeto.
- Edição (`updatePurchaseRequest`) **só em `DRAFT`/`SUBMITTED`**; fora disso → `PROCUREMENT_INVALID_STATE`.
- Exclusão lógica (`deletePurchaseRequest`) **só em `DRAFT`/`CANCELLED`** e sem cotações vinculadas.
- Requisição **vencida** = data de necessidade anterior a hoje **e** requisição aberta (não aprovada/cancelada/rejeitada).

**Saída:** requisição aberta e pronta para receber cotações.

---

### Etapa 2 — Cotação (QT)

**Quem:** Comprador (contata fornecedores e registra as propostas).

**O que acontece:**
1. Para cada fornecedor interessado, cria uma **cotação** vinculada à requisição e ao fornecedor:
   - Requisição de compra (obrigatório).
   - Fornecedor (obrigatório, deve estar `ACTIVE`).
   - Data da cotação, validade, prazo de entrega (dias), condições de pagamento, termo de frete.
   - Frete e desconto.
   - Itens precificados: descrição, quantidade, unidade, preço unitário, marca, observações (pode referenciar o item da requisição de origem).
2. O sistema gera o código `QT001`, `QT002`… e define o status inicial `DRAFT`.
3. Calcula automaticamente os totais: `itemsTotal = Σ(qtd × preço unit.)` e `totalAmount = max(0, itemsTotal + frete − desconto)`.
4. Se a requisição estava em `SUBMITTED`, ela avança automaticamente para `QUOTING`.

**Transições:**
- `DRAFT → SUBMITTED` via ação **Submeter** (exige ≥1 item precificado). A partir daqui a cotação está "enviada" e pode ser selecionada ou desqualificada.
- `SUBMITTED → SELECTED` via **Selecionar** (vencedora) — normalmente feito pelo mapa comparativo.
- `SUBMITTED → REJECTED` via **Desqualificar**.
- `SUBMITTED/CANCELLED/REJECTED → DRAFT` via **Reabrir**.

**Regras:**
- Idempotência por `clientUuid` (escopo do projeto).
- Fornecedor deve existir na organização e estar `ACTIVE` (`isSupplierActive`); caso contrário → `VALIDATION_ERROR`.
- Requisição não pode estar `CANCELLED`/`REJECTED`/`APPROVED`.
- Edição (`updateQuotation`) **só em `DRAFT`** (`isQuotationEditable`); fora disso → `PROCUREMENT_INVALID_STATE`.
- Exclusão lógica (`deleteQuotation`) **só em `DRAFT`/`CANCELLED`**.
- Totais recalculados em create e update.

**Saída:** conjunto de cotações (propostas) para a requisição, prontas para equalização.

---

### Etapa 3 — Mapa Comparativo (BC)

**Quem:** Comprador / gestor de suprimentos.

**O que acontece:**
1. Com as cotações submetidas, gera o **mapa comparativo** a partir da requisição:
   - O sistema lê todas as cotações (não excluídas) da requisição.
   - Ordena por preço (crescente) e calcula a diferença percentual em relação ao menor preço.
   - Identifica a cotação de **menor preço** e a de **menor prazo** (entre as com prazo > 0).
   - Pré-seleciona a de menor preço como vencedora sugerida.
2. Gera/atualiza o rascunho `BC001`, `BC002`… com os dados de equalização (`comparisonData`).
3. O usuário revisa a tabela equalizada (fornecedor, cotação, prazo, condições, frete, desconto, total, diferença %).
4. **Conclui o mapa** selecionando a cotação vencedora e informando a **justificativa da escolha** (mínimo 5 caracteres).

**Efeitos da conclusão (transação):**
- Cotação vencedora → `SELECTED`.
- Demais cotações `SUBMITTED`/`DRAFT` → `REJECTED`.
- Mapa comparativo → `COMPLETED` (grava `completedAt` e `completedById`).
- Requisição de compra → `COMPARED`.

**Regras:**
- `createOrUpdateBidComparison` cria ou atualiza o rascunho, recalculando a análise a partir das cotações atuais.
- Idempotência por `clientUuid` no create.
- A cotação selecionada deve pertencer à requisição (validação `VALIDATION_ERROR` caso contrário).
- `analyzeBidComparison` é função pura (testável sem I/O).

**Saída:** fornecedor vencedor definido, requisição cotada.

---

### Etapa 4 — Aprovação da Requisição

**Quem:** Gestor de projeto ou PMO (permissão `PROCUREMENT:APPROVE`).

**O que acontece:**
1. Com a requisição em `COMPARED`, o gestor revisa o mapa comparativo e a justificativa.
2. Aprova a requisição via ação **Aprovar** (com motivo opcional).
3. A requisição avança para `APPROVED`.

**Regras:**
- `APPROVE` de requisição `COMPARED` exige cotação selecionada no mapa (`hasSelectedQuotation`).
- Requisição `SUBMITTED` pode ser aprovada diretamente (sem cotação/mapa), quando a compra é simples ou emergencial.
- Requisição `APPROVED` é terminal nesta fatia — não pode ser cancelada diretamente (exige fluxo de mudança/encerramento).

**Saída:** requisição aprovada, pronta para gerar o Pedido de Compra (Fatia 2).

---

### Etapa 5 — Pedido de Compra (PO) *(Fatia 2 — planejada)*

**Status:** não implementado. Descrição do escopo previsto.

**Quem:** Comprador / equipe de suprimentos.

**O que acontece (previsto):**
1. A partir de uma requisição `APPROVED`, emite o **Pedido de Compra** (`PO001`…) formalizando:
   - Fornecedor vencedor (da cotação `SELECTED`).
   - Itens, quantidades e preços (da cotação vencedora).
   - Prazo de entrega, condições de pagamento, termo de frete.
   - Vínculos a WBS, atividade e item de custo (herdados da requisição).
2. O pedido é enviado ao fornecedor e seu status avança de `DRAFT` para `ISSUED`.
3. O pedido pode ser **parcialmente recebido** (status `PARTIALLY_RECEIVED`) ou **totalmente recebido** (`FULLY_RECEIVED`).

**Transições previstas:**
- `DRAFT → ISSUED` (emissão ao fornecedor).
- `ISSUED → PARTIALLY_RECEIVED` (recebimento parcial).
- `ISSUED/PARTIALLY_RECEIVED → FULLY_RECEIVED` (recebimento total).
- `ISSUED → CANCELLED` (cancelamento, com motivo).
- `FULLY_RECEIVED → CLOSED` (fechamento após conferência e fatura).

**Regras previstas:**
- Idempotência por `clientUuid`.
- Código sequencial `PO001`… por projeto.
- Só é possível emitir PO a partir de requisição `APPROVED`.
- Apenas uma PO ativa por requisição (ou N, se compras parciais — a definir na Fatia 2).
- Cancelamento de PO com recebimento iniciado exige justificativa e pode gerar ajuste de custo.

**Saída:** pedido formalizado e enviado ao fornecedor, rastreável até a requisição e à cotação vencedora.

---

### Etapa 6 — Recebimento e Inspeção *(Fatia 2 — planejada)*

**Quem:** Almoxarife / equipe de campo + inspetor de qualidade.

**O que acontece (previsto):**
1. Ao chegar o material/serviço, registra o **Recebimento** (`GR001`…) contra o pedido:
   - Data de recebimento, responsável, quantidade recebida por item.
   - Quantidade rejeitada (se houver) e motivo.
   - Observações e evidências (fotos).
2. O recebimento pode ser **parcial** (uma ou mais entregas) ou **total**.
3. Para itens críticos, realiza **inspeção de recebimento** vinculada ao módulo de Qualidade (E13):
   - Cria uma `Inspection` com critério de aceite.
   - Vincula fotos de evidência (`inspectionId`).
   - Registra resultado `PASS`/`FAIL`; no `FAIL` gera NCR automático.
4. Se a inspeção falhar, o recebimento fica bloqueado até a resolução da NCR (ou aceite com ressalva, a definir).

**Transições previstas:**
- Recebimento: `DRAFT → CONFIRMED → (parcial/total)`.
- Inspeção: reutiliza a máquina de estados de `Inspection` (E13): `PLANNED → EXECUTED → PASSED/FAILED → CLOSED`.

**Regras previstas:**
- Não é possível receber mais do que o saldo do pedido (quantidade pedida − já recebida).
- Recebimento com inspeção reprovada não avança o status do pedido para `FULLY_RECEIVED` até resolução.
- Toda escrita gera `AuditEvent` e `DomainEvent` (`GoodsReceipt.Created`, `.Confirmed`).

**Saída:** material/serviço recebido, conferido e (quando aplicável) inspecionado.

---

### Etapa 7 — Fechamento Financeiro *(Fatia 2 — planejada)*

**Quem:** Financeiro / controladoria.

**O que acontece (previsto):**
1. Com o pedido totalmente recebido e inspecionado, o financeiro:
   - Registra o **commitment** de custo (integração com o módulo de Custos E09).
   - Registra a **fatura** do fornecedor e a medição de avanço físico (integração com E12).
   - Concilia valores pedidos vs. recebidos vs. faturados.
2. Fecha o pedido (`CLOSED`) e encerra a requisição original (já `APPROVED`).
3. Atualiza o painel de suprimentos (`getProcurementBoard`) com as métricas finais.

**Saída:** ciclo de aquisição encerrado, custos e avanço atualizados.

---

## 4. Regras transversais (Fatia 1, implementadas)

- **Escopo de tenant** sempre validado (`assertProcurementProject`): projeto deve existir e pertencer à organização.
- **Códigos automáticos** por escopo: `SP` (organização), `PR`/`QT`/`BC` (projeto) — sequencial de 3 dígitos.
- **Idempotência offline** por `clientUuid` em fornecedor, requisição, cotação e mapa comparativo (`@@unique([scope, clientUuid])`).
- **Auditoria** (`AuditEvent`) em toda escrita: CREATE, UPDATE, DELETE, STATUS_CHANGE, COMPLETE.
- **Domain events** (`DomainEvent`) em criações e transições relevantes: `Supplier.Created`, `PurchaseRequest.Created`/`.StatusChanged`, `Quotation.Created`, `BidComparison.Completed`.
- **Versionamento otimista** (`version` incrementado) em updates.
- **Exclusão lógica** (`deletedAt`/`deletedBy`) em todas as entidades; listagens filtram `deletedAt: null`.
- **Permissões** por módulo `PROCUREMENT` com ações `VIEW/CREATE/EDIT/APPROVE/REJECT/DELETE`, atribuídas por papel (PMO, PM, Suprimentos, etc.).
- **Fornecedor é escopo da organização**, não do projeto — reutilizável entre projetos.

---

## 5. Máquinas de estados (resumo)

### 5.1 Fornecedor

`ACTIVE` (pode receber cotações) · `BLOCKED` · `INACTIVE` (desativado; usado em vez de exclusão quando há cotações vinculadas). Status alterado via `updateSupplier`.

### 5.2 Requisição de Compra

```
DRAFT ──SUBMIT──► SUBMITTED ──START_QUOTING──► QUOTING ──FINISH_QUOTING──► COMPARED ──APPROVE──► APPROVED
  │                    │                          │                          │
  │                    ├──APPROVE──► APPROVED     │                          ├──REJECT──► REJECTED
  │                    ├──REJECT──► REJECTED       │                          │
  │                    ├──CANCEL──► CANCELLED      ├──CANCEL──► CANCELLED      ├──CANCEL──► CANCELLED
  └──CANCEL──► CANCELLED                          │
CANCELLED/REJECTED ──REOPEN──► DRAFT
```

Editável apenas em `DRAFT`/`SUBMITTED`. Excluível apenas em `DRAFT`/`CANCELLED` (sem cotações).

### 5.3 Cotação

```
DRAFT ──SUBMIT──► SUBMITTED ──SELECT──► SELECTED
  │                    │
  │                    ├──REJECT──► REJECTED
  │                    ├──CANCEL──► CANCELLED
  │                    └──REOPEN──► DRAFT
  └──CANCEL──► CANCELLED
CANCELLED/REJECTED/SUBMITTED ──REOPEN──► DRAFT
```

Editável apenas em `DRAFT`. Excluível apenas em `DRAFT`/`CANCELLED`.

### 5.4 Mapa Comparativo

`DRAFT → COMPLETED` (via `completeBidComparison`, que seleciona a vencedora e avança a requisição para `COMPARED`) · `CANCELLED`.

### 5.5 Pedido de Compra (previsto — Fatia 2)

`DRAFT → ISSUED → PARTIALLY_RECEIVED → FULLY_RECEIVED → CLOSED` · `ISSUED → CANCELLED`.

### 5.6 Recebimento (previsto — Fatia 2)

`DRAFT → CONFIRMED` (parcial ou total), com inspeção de recebimento opcional via E13.

---

## 6. API (Fatia 1 — 14 rotas implementadas)

Base: `/api/v1/projects/[id]/procurement/…` (exceto fornecedores em `/api/v1/suppliers/…`).
Padrão `apiHandler` + `actorOf` + `idsFrom`/`projectIdFrom`. Permissões: `PROCUREMENT:VIEW/CREATE/EDIT/APPROVE/REJECT/DELETE`.

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

## 7. Telas (Fatia 1)

- **`/suprimentos`** — visão geral por projeto: contagem de requisições, em cotação, cotadas, aprovadas e fornecedores homologados; link para a tela do projeto.
- **`/projetos/[id]/suprimentos`** — página principal (`procurement-view.tsx`), server-side com os selectors.

Componentes da tela:
- **Quadro**: Requisições · Abertas · Em cotação · Cotadas/Comp. · Aprovadas · Fornecedores Ativos.
- **Aba Requisições**: tabela com código, título, prioridade, status, necessidade, itens, cotações; ações Enviar / Iniciar Cotação / Aprovar / Ver itens; diálogo de criação com itens dinâmicos, prioridade, vínculos WBS/atividade/custo.
- **Aba Cotações**: tabela com código, requisição, fornecedor, prazo, pagamento, total, status; ação Submeter; diálogo de criação com itens precificados, frete e desconto.
- **Aba Mapa Comparativo**: seleção de requisição; tabela equalizada (fornecedor, cotação, prazo, condições, frete, desconto, total, diferença %, seleção por radio); destaque da menor preço; conclusão com justificativa.
- **Aba Fornecedores**: cards com código, status, nome, fantasia, CNPJ, categoria, e-mail/telefone; diálogo de cadastro.

---

## 8. Limitações conhecidas (hoje)

1. **Sem pedido de compra (PO) e recebimento** — a Fatia 1 fecha em `APPROVED` na requisição; PO/recebimento/inspeção de recebimento ficam para a Fatia 2.
2. **Edição de requisição bloqueada após SUBMITTED avançado** — requisição só é editável em `DRAFT`/`SUBMITTED`; itens não podem ser alterados em cotação.
3. **Cotação bloqueada após submissão** — edição só em `DRAFT`.
4. **Um mapa comparativo por requisição** — `getBidComparisonByRequestId` retorna o primeiro; `completeBidComparison` reutiliza o existente.
5. **Conclusão do mapa não valida justificativa mínima no backend além do zod** (`min(5)` caracteres) — textos curtos passam.
6. **Exclusão de fornecedor com cotações vinculadas é bloqueada** — desativar via status é o caminho.
7. **Código sequencial não é atômico** — concorrência pode gerar duplicidade (mitigada pelo unique constraint, que retorna CONFLICT).
8. **`leadTimeDays: 0` é válido** — corrigido para não ser convertido em `null`.

---

## 9. Próximo passo

**E14 Fatia 2**: Pedido de Compra (PO) e recebimento — vincular a requisição aprovada a um PO, controle de entrega/recebimento, inspeção de recebimento e integração com estoque/custos. Ainda não iniciado.

---

## 10. Verificação (gate da Fatia 1)

- `eslint` 0 problemas · `tsc --noEmit` limpo.
- **263 testes unitários** (`tests/unit/procurement-engine.test.ts` — máquina de estados de requisição e cotação, cálculo de totais, análise de bid comparison, board summary).
- **285 testes de integração** (`tests/integration/procurement.test.ts` — fornecedores com idempotência e isolamento de tenant, requisições com idempotência e transições, cotações com avanço automático para QUOTING, mapa comparativo completo, aprovação, restrições de exclusão, board).
- Migration `20261030190000_phase15_procurement` (enums `SupplierStatus`, `PurchaseRequestStatus`, `QuotationStatus`, `BidComparisonStatus` + tabelas `suppliers`, `purchase_requests`, `purchase_request_items`, `quotations`, `quotation_items`, `bid_comparisons` + FKs) — aplicada localmente (dev e `mici_test`) e no Neon.
- Deploy: commit `2ea90bb` → `mici-5w7tzxsmi-homeland1` (alias `mici-theta.vercel.app`), smoke verde nas rotas de suprimentos e fornecedores.
- Documentação: `suprimentos.md` (este arquivo), entrada em `DIARIO.md`, status em `ROADMAP.md`, estado em `devcurrent.md`.

> Detalhamento diário em [`DIARIO.md`](DIARIO.md) (seção "30/10/2026 — E14 Procurement, Fatia 1").