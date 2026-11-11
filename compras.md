# compras.md — Definição de RFI e escopo de Compras/Suprimentos

## RFI (Request for Information) — escopo interno

A RFI implementada no MICI (Onda 4, módulo `src/modules/rfi`) foi definida como
um **instrumento de comunicação interna** entre membros da equipe do projeto
(gerente, engenharia, qualidade, suprimentos, etc.) para esclarecer dúvidas
técnicas, de escopo ou de requisitos. Ela **não** foi criada para iniciar ou
gerenciar um processo de cotação/compras.

### O que a RFI faz

- É numerada por projeto (`RFI001`, `RFI002`, …).
- Possui título, pergunta, destinatário (usuário interno), prazo, status
  (`OPEN` → `ANSWERED` → `CLOSED`, ou `CANCELLED`/`REOPEN`).
- Permite vincular a um nó da WBS, a uma atividade do cronograma ou a um
  requisito, para rastreabilidade.
- A resposta é registrada no próprio RFI, com autor e data.

### O que a RFI NÃO faz

- **Não inicia cotação.** O fluxo de compras/cotação é responsabilidade do
  módulo de **Suprimentos (Procurement, E14)**, que possui requisição de compra
  (PR), cotação (QT), mapa comparativo (BC) e pedido de compra (PO).
- **Não envolve fornecedores externos.** RFI é troca de informação entre
  membros internos da organização/projeto.
- **Não substitui** a requisição de compra (`PurchaseRequest`) nem a cotação
  (`Quotation`). Quando uma dúvida técnica precisa virar compra, o fluxo correto
  é: RFI (esclarecimento) → Requisição de Compra (PR) no módulo de
  Suprimentos → Cotação → Pedido de Compra (PO).

### Módulo de Suprimentos (Procurement) — onde ocorre a cotação

O módulo de Suprimentos (`src/modules/procurement`, rota `/suprimentos` e
`/projetos/[id]/suprimentos`) cobre o ciclo completo de compras:

1. **Fornecedores** (Supplier, código `SP001`) — cadastro de fornecedores.
2. **Requisição de Compra** (PurchaseRequest, código `PR001`) — solicitação
   interna de materiais/serviços, com itens, status e aprovação.
3. **Cotação** (Quotation, código `QT001`) — proposta de fornecedor, com itens
   precificados, prazo de entrega e condições.
4. **Mapa Comparativo** (BidComparison) — análise de cotações (menor preço,
   menor prazo, diferença percentual).
5. **Pedido de Compra** (PurchaseOrder, código `PO001`) — emissão ao
   fornecedor, com recebimento (`GR001`) e integração com custos
   (CostCommitment/CostActual).

### Resumo

| Instrumento | Escopo | Módulo |
|---|---|---|
| RFI | Esclarecimento técnico interno (pergunta/resposta) | `rfi` (Onda 4) |
| Requisição de Compra (PR) | Solicitação interna de compra | `procurement` (E14) |
| Cotação (QT) | Proposta de fornecedor | `procurement` (E14) |
| Pedido de Compra (PO) | Compra efetiva ao fornecedor | `procurement` (E14) |

Portanto, a RFI **não** é o ponto de partida de um processo de cotação. Ela serve
apenas para registrar e acompanhar dúvidas internas do projeto, com rastreabilidade
a WBS, atividades e requisitos. Para iniciar compras, utilize o módulo de
Suprimentos.
