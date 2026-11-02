# Fluxo completo — E01–E14 + E08+ (Cost Tracking & Cash Flow)

## 1. Visão geral do ciclo (MVP)

```
Oportunidade → Requisitos → Orçamento → Projeto → Baseline → Execução →
Avanço → Custo → Risco → Mudança → Qualidade → Comissionamento →
Aceite → Encerramento
```

Cada seta é gateada (G0–G8) e auditada. Multi-tenant, RBAC por módulo/ação.

## 2. Épicos e o que cada um entrega

| Épico | Módulo | Entrega-chave |
|---|---|---|
| E01 Foundation | `src/lib`, `prisma` | Next 16 + TS + Tailwind 4, Prisma 7, Auth.js v5, RBAC 18×25×8, outbox `domain_events`/`job_queue`, CI, Vercel+Neon. |
| E02 Identity | `modules/identity` | Usuários, orgs, memberships, papéis, troca de org, auditoria, isolamento de tenant. |
| E03 Project | `modules/portfolio` | Client, Project, ProjectTemplate, clonagem, gates G0–G8 com snapshot imutável, BR-001/BR-002. |
| E04 Requirements | `modules/requirements` | Requisito versionado, DRP (§20), BR-008/BR-015, gate G1 exige DRP completo. |
| E05 WBS | `modules/wbs` | Árvore com numeração, reorder, import/export JSON/CSV, versionamento (`WBSVersion`). |
| E06 Gates | `modules/gates` | GateDefinition/Instance, critérios, aprovações múltiplas, bloqueio de fase. |
| E07 Schedule | `modules/schedule` | Atividades (FS/SS/FF/SF + lag), CPM, calendário, baseline SCHEDULE, forecast, import MS Project. |
| E08 Cost (+E08+) | `modules/cost`, `modules/budget` | CostItem/Commitment/Actual, EVM, baseline COST, gate G4, orçamento de cozinha (stateless), rastreio por WBS/atividade + cash flow CSV. |
| E09 Documents | `modules/documents` | Upload bytea (4 MB), revisões imutáveis, aprovação/release, links a objetos, BR-009/010/011. |
| E10 Risk | `modules/risk` | Risk register, matriz 5×5 configurável, respostas, risco residual, escalada CRITICAL. |
| E11 Change | `modules/change` | ChangeRequest, impacto 11 dimensões, aprovação append-only, baseline revision vinculada (BR-005), item de ajuste de custo. |
| E12 Field | `modules/field` | Diário, tarefa, restrição, foto, medição (BR-006), PWA + fila offline (idempotência por `clientUuid`). |
| E13 Quality | `modules/quality` | Checklist modelo/execução, inspeção com evidência, NCR automático, ação corretiva, punch list. |
| E14 Procurement | `modules/procurement` | Fornecedores (SP), requisição (PR), cotação (QT), mapa comparativo (BC), PO (PO001), recebimento (GR001). |

## 3. Fluxo end-to-end (com módulos)

### Etapa A — Oportunidade e portfólio (E01/E02/E03/E06)
1. Criar organização, usuários, papéis (E02).
2. Criar projeto a partir de template; gates G0–G8 instanciados com snapshot (E03/E06).
3. G0 qualifica a oportunidade; avanço de fase bloqueado sem gates (BR-001/BR-002).

### Etapa B — Requisitos e WBS (E04/E05)
4. Cadastrar requisitos versionados, vincular a WBS, evidências (BR-008/BR-015).
5. Gerar DRP; G1 exige DRP completo.
6. Montar árvore WBS (importação MS Project, versionamento).

### Etapa C — Orçamento (E08/budget + E08)
7. Calculadora de cozinha (`/orcamento`) → JSON → `import-estimate` → `CostItem` (ORC001…).
8. Itens manuais (CI001…) com categoria, WBS, atividade.
9. Compromissos (CC001) e realizados (CA001) manuais.
10. Baseline COST aprovada; G4 bloqueia aprovação sem baseline.
11. EVM (BAC/AC/EV/PV/SPI/CPI) por data de corte.

### Etapa D — Cronograma (E07)
12. Atividades com dependências, CPM, calendário, baseline SCHEDULE.
13. Forecast e caminho crítico.

### Etapa E — Riscos e mudanças (E10/E11)
14. Risk register com matriz configurável, respostas, residual, escalada.
15. ChangeRequest com impacto 11 dimensões; aprovação; implementação vincula baseline (BR-005) e gera item de ajuste de custo (E11 §31).

### Etapa F — Suprimentos (E14 + E08+)
16. Cadastrar fornecedores (SP, escopo da org).
17. Criar requisição (PR) com itens, vínculos WBS/atividade/custo.
18. Cotações (QT) dos fornecedores; mapa comparativo (BC) seleciona vencedora.
19. Aprovar requisição (COMPARED → APPROVED).
20. Emitir PO (PO001) a partir da requisição aprovada → cria CostCommitment vinculado (idempotente por PO).
21. Receber (GR001) contra o PO → confirma → cria CostActual vinculado (idempotente por GR), atualiza `receivedQuantity` e status do PO (PARTIALLY/FULLY_RECEIVED).

### Etapa G — Campo e qualidade (E12/E13)
22. Diário de obra, tarefas, restrições, fotos, medição (BR-006) com idempotência offline.
23. PWA + fila offline (IndexedDB) com sync FIFO.
24. Checklist modelo/execução, inspeção com evidência, NCR automático, ação corretiva, punch list.

### Etapa H — Documentos (E09)
25. Upload, revisão, aprovação, release, links a objetos (WBS, schedule, cost, document).

### Etapa I — Comissionamento (E15 — a iniciar)
26. Plano, teste, reteste, aceite.

### Etapa J — Aceite e encerramento (G7/G8)
27. Aprovação final, encerramento do projeto.

## 4. Rastreio bidirecional (E08+ / E14)

```
GoodsReceipt (GR001)
   └─ CostActual (CAxxx)  ← goodsReceiptId, wbsNodeId, activityId, costItemId
         └─ CostCommitment (CCxxx) ← purchaseOrderId, wbsNodeId, activityId, costItemId
               └─ PurchaseOrder (PO001) ← costItemId, wbsNodeId, activityId
                     └─ PurchaseRequest (PR001) ← costItemId, wbsNodeId, activityId
                           └─ CostItem (CI/ORCxxx) ← wbsNodeId, activityId
                                 └─ WBSNode / ScheduleActivity
```

- A partir de qualquer ponto (recebimento, PO, requisição, CostItem, WBS, atividade) é possível navegar aos demais via FKs.
- CostCommitment é criado automaticamente ao emitir o PO (idempotente por `purchaseOrderId`).
- CostActual é criado automaticamente ao confirmar o recebimento (idempotente por `goodsReceiptId`).

## 5. Fluxo de caixa (planejado / comprometido / realizado / acumulado)

| Tipo | Fonte | Entidade | Campo de data |
|---|---|---|---|
| PLANEJADO | Orçamento (import-estimate ou manual) | `CostItem.amount` | — (sem data; BAC) |
| COMPROMETIDO | PO emitido | `CostCommitment.amount` (status OPEN) | `committedAt` |
| REALIZADO | Recebimento confirmado | `CostActual.amount` | `incurredAt` |
| ACUMULADO | EV (EVM) | `physicalProgress` × BAC | data de corte |

- Export: `GET /api/v1/projects/[id]/cost/cashflow/export` → CSV com colunas `date,type,code,description,category,wbs,activity,amount,source`.
- Import: `POST /api/v1/projects/[id]/cost/cashflow/import` → CSV (multipart `file` ou campo `csv`) cria CostItems (PLANNED), CostCommitments (COMMITTED) e CostActuals (ACTUAL). Custos indiretos sem WBS/atividade → categoria `INDIRETO`/`OUTROS`.

## 6. Rastreio no menu Custos

- `/projetos/[id]/custos` — EVM + CRUD de itens/compromissos/realizados/baselines + import-estimate + botões export/import de cash flow.
- `/custos` — visão de portfólio (uma linha por projeto).
- Cada CostItem exibe WBS/atividade; links para PO/recebimento/requisição via FKs.

## 7. Integrações com Schedule e WBS

- `CostItem.wbsNodeId` / `activityId` vinculam custo a um nó de WBS e/ou atividade do cronograma.
- `CostCommitment` e `CostActual` herdam `wbsNodeId`/`activityId` do PO (que por sua vez herda da requisição).
- Permite responder: "quanto custou a atividade X?" e "qual o custo acumulado da WBS Y?".

## 8. Documentação de referência (RAG)

- Detalhes de cada módulo: `npm run rag:query <termo>` (ex.: `npm run rag:query procurement cost cashflow`).
- Índice completo: `docs/rag-index.md`.
- Docs por módulo: `suprimentos.md`, `custos.md`, `qualidade.md`, `campo.md`.
