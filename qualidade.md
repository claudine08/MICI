# Qualidade — fluxo de modelos, execuções e inspeções (E13)

> Fonte: código em `src/modules/quality/`, `prisma/schema.prisma` (§33/§34) e
> registro em `DIARIO.md` (E13 Fatia 1, 24/10/2026).
> **Status: Fatia 1 no ar** (modelos, execuções e inspeções).
> **Fatia 2 pendente**: NCR (`NonConformity`), ação corretiva (`CorrectiveAction`)
> e punch list (E13-US03/US04/US05, §34).

---

## 1. Os quatro conceitos

| Conceito | Entidade | O que é | Código |
|---|---|---|---|
| **Modelo de checklist** | `ChecklistTemplate` | Biblioteca de itens por projeto. Guarda **apenas texto + obrigatoriedade** — nunca resultado. | `CT001`, `CT002`… |
| **Execução de checklist** | `ChecklistExecution` | Uma "aplicação" do modelo para uma data/inspeção, com **snapshot congelado** dos itens e as respostas (`PASS`/`FAIL`/`NA` + observação). | `CE001`, `CE002`… |
| **Inspeção** | `Inspection` | Verificação planejada com **critério de aceite obrigatório**, data, responsável e vínculos WBS/atividade. É o "caso" que sustenta o resultado. | `IN001`, `IN002`… |
| **Evidência** | `PhotoEvidence` | Foto de prova material. Pode ser vinculada a **inspeção** (`inspectionId`), **diário**, **WBS** ou **atividade**. | `PH001`… |

Relações:
- Modelo **1 → N** Execuções (a execução guarda `templateCode`/`templateName` no snapshot).
- Inspeção **1 → N** Execuções (campo `inspectionId`, opcional; `ON DELETE SET NULL`).
- Inspeção **1 → N** Fotos (`inspectionId` em `photo_evidence`).

---

## 2. Fluxo completo (visão geral)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. MODELO (ChecklistTemplate)                                            │
│    criar itens [{key, text, required}] → código CTxxx automático         │
│    (mínimo 1 item; modelo com execuções NÃO é excluível)                 │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    │ "nova execução" escolhe o modelo
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 2. EXECUÇÃO (ChecklistExecution) — status DRAFT ("Em preenchimento")     │
│    • snapshot dos itens congelado na criação (result: null, note: null)  │
│    • opcionalmente vinculada a uma INSPeÇÃO e a um inspectorId           │
│    • responder item a item: PASS / FAIL / NA + observação                │
│    • edição de itens SÓ em DRAFT                                         │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    │ COMPLETE (todos os obrigatórios
                                    │          respondidos)
                                    ▼
                      COMPLETED ("Concluída")  ← vira EVIDÊNCIA da inspeção
                                    │
                                    │ REOPEN → volta a DRAFT (editar)
                                    │ CANCEL (exige motivo) → CANCELLED
                                    └───────────────────────────────────────

┌──────────────────────────────────────────────────────────────────────────┐
│ 3. INSPeÇÃO (Inspection) — paralela ao checklist                         │
│    criar: título, data, critério de aceite OBRIGATÓRIO, inspector,       │
│           vínculo WBS/atividade → código INxxx, status PLANNED           │
│    PLANNED ──EXECUTE──► EXECUTED ──PASS──► PASSED ──CLOSE──► CLOSED      │
│                          │  │                                          │
│                          │  └──FAIL──► FAILED ──CLOSE──► CLOSED         │
│                          │                                               │
│                          │   ▲ sair de EXECUTED exige EVIDÊNCIA:        │
│                          │   │  foto vinculada (≥1) OU execução         │
│                          │   │  de checklist COMPLETED vinculada (≥1)   │
│                          │   └── REOPEN (de PASSED/FAILED) volta a      │
│                          │       EXECUTED                                │
│    CANCELLED ──REOPEN──► PLANNED                                         │
└──────────────────────────────────────────────────────────────────────────┘
```

Fluxo recomendado na prática (o que a spec §33 descreve):

1. Criar o **modelo** com os itens de verificação (uma vez, reutilizável).
2. Criar a **inspeção** com o **critério de aceite** e a data da verificação.
3. Gerar a **execução** a partir do modelo, **vinculando à inspeção**.
4. Vincular **fotos de evidência** à inspeção (upload com `inspectionId`).
5. Responder os itens da execução (`PASS`/`FAIL`/`NA`) e **concluir**.
6. Registrar o resultado da inspeção: **PASS** ou **FAIL**
   (aqui o sistema **exige** a evidência do passo 4 ou do passo 5).
7. **Encerrar** a inspeção (`CLOSE`) — hoje permitido a partir de PASSED ou FAILED;
   na Fatia 2, em `FAILED` passará a exigir **NCR encerrado**.

---

## 3. Máquinas de estados

### 3.1 Execução de checklist (`engine.ts`)

| Status | Rótulo PT | Ações disponíveis | Observação |
|---|---|---|---|
| `DRAFT` | Em preenchimento | `COMPLETE`, `CANCEL` | único status **editável** |
| `COMPLETED` | Concluída | `REOPEN` | não excluível; vira evidência |
| `CANCELLED` | Cancelada | `REOPEN` | `CANCEL` exige motivo |

Regra de `COMPLETE`: `summarizeChecklistItems(...).complete === true`, ou seja,
**todos os itens obrigatórios respondidos** (`result` preenchido). Itens não
obrigatórios podem ficar pendentes.

### 3.2 Inspeção (`engine.ts`)

| Status | Rótulo PT | Ações disponíveis | Editável? |
|---|---|---|---|
| `PLANNED` | Planejada | `EXECUTE`, `CANCEL` | sim |
| `EXECUTED` | Executada | `PASS`, `FAIL`, `CANCEL` | sim |
| `PASSED` | Aprovada | `CLOSE`, `REOPEN` | não (histórico) |
| `FAILED` | Reprovada | `CLOSE`, `REOPEN` | não (histórico) |
| `CLOSED` | Encerrada | — (terminal) | não |
| `CANCELLED` | Cancelada | `REOPEN` (→ PLANNED) | não |

Regras adicionais gravadas no writer (`inspections.ts`):
- `FAIL` **exige** `resultNotes` (descrição da não conformidade). Na Fatia 2
  esse campo alimenta o NCR.
- `PASS`/`FAIL` **exigem evidência**: `inspectionHasEvidence` →
  `photoCount > 0 || completedChecklists > 0`.
- `CANCEL` exige motivo.
- Exclusão lógica **só** em `PLANNED` ou `CANCELLED`; executa-se "cancelar"
  para preservar a trilha.

---

## 4. Regras de negócio (gravadas nos writers)

**Modelo (`templates.ts`)**
- Mínimo de 1 item, com texto não vazio (`isValidTemplateItems`).
- Itens do modelo nunca têm `result` — o resultado nasce na execução.
- **Não é excluível** se existir execução vinculada (CONFLICT com a contagem).

**Execução (`executions.ts`)**
- Snapshot dos itens **congelado na criação**: alterar o modelo depois **não**
  muda execuções já existentes (rastro de conformidade).
- Resposta de itens (`result`/`note`) **só em `DRAFT`**; fora dele, CONFLICT
  ("reabra para editar").
- `COMPLETE` exige todos os obrigatórios respondidos.
- `COMPLETED` **não é excluível** (reabra → cancele) — é evidência de inspeção.
- Vínculo com inspeção valida projeto/organização e **bloqueia inspeção
  cancelada**.

**Inspeção (`inspections.ts`)**
- `criterion` obrigatório (§33: item só conclui quando atinge o critério).
- Só edita em `PLANNED`/`EXECUTED`.
- `PASS`/`FAIL` exigem evidência material (foto ou checklist concluído).
- `FAIL` exige não conformidade descrita (`resultNotes`).
- Inspeção executada não é excluível — cancele para preservar a trilha.

**Transversal (módulo `common.ts`, reutiliza o módulo de campo)**
- Escopo de tenant sempre validado (`assertQualityProject`).
- Código automático por projeto: `CT` (modelo), `CE` (execução), `IN` (inspeção)
  — sequencial de 3 dígitos (`CT001`).
- Idempotência offline por `clientUuid` (`@@unique([projectId, clientUuid])`
  em execução e inspeção): reenvio devolve o registro original.
- Toda escrita gera `AuditEvent` (CREATE/UPDATE/DELETE/ação) e `DomainEvent`
  (`Quality.ChecklistTemplate.*`, `Quality.ChecklistExecution.*`,
  `Quality.Inspection.*`).
- Campos de data: `inspectionDate` (DATE) e datas de transição
  (`executedAt`, `closedAt`, `completedAt`).

---

## 5. Evidência (a regra do §33 na prática)

A inspeção só pode sair de `EXECUTED` para `PASSED`/`FAILED` com prova material:

| Tipo | Como vincular hoje | Onde contar |
|---|---|---|
| **Foto de evidência** | Upload em `POST /api/v1/projects/[id]/field/photos` com o campo `inspectionId`; filtro de listagem `?inspectionId=` | `photoEvidence.count({ inspectionId, deletedAt: null })` |
| **Checklist concluído** | Criar a execução com `inspectionId` e concluir (`COMPLETED`) | `checklistExecution.count({ inspectionId, status: "COMPLETED" })` |

Mostrado na tela de inspeções como `N foto(s) · M checklist(s) concluído(s)`.

---

## 6. API (8 rotas)

Base: `/api/v1/projects/[id]/quality/…` — padrão `apiHandler` + `actorOf` +
`idsFrom`, mesmo padrão do módulo de campo.

| Método | Rota | Permissão | Função |
|---|---|---|---|
| GET | `/checklist-templates` | `QUALITY:VIEW` | lista modelos |
| POST | `/checklist-templates` | `QUALITY:CREATE` | cria modelo (`CTxxx`) |
| GET | `/checklist-templates/[templateId]` | `QUALITY:VIEW` | detalhe |
| PATCH | `/checklist-templates/[templateId]` | `QUALITY:EDIT` | edita nome/descrição/itens |
| DELETE | `/checklist-templates/[templateId]` | `QUALITY:DELETE` | exclui (se sem execuções) |
| GET | `/checklist-executions` | `QUALITY:VIEW` | lista (`?inspectionId=`, `?status=`) |
| POST | `/checklist-executions` | `QUALITY:CREATE` | cria execução (`CExxx`, snapshot) |
| GET | `/checklist-executions/[executionId]` | `QUALITY:VIEW` | detalhe com resumo |
| PATCH | `/checklist-executions/[executionId]` | `QUALITY:EDIT` | responde itens (só DRAFT) |
| DELETE | `/checklist-executions/[executionId]` | `QUALITY:DELETE` | exclui (se não COMPLETED) |
| POST | `/checklist-executions/[executionId]/status` | `QUALITY:EDIT` | `COMPLETE`/`REOPEN`/`CANCEL` |
| GET | `/inspections` | `QUALITY:VIEW` | lista (`?status=`) |
| POST | `/inspections` | `QUALITY:CREATE` | cria inspeção (`INxxx`) |
| GET | `/inspections/[inspectionId]` | `QUALITY:VIEW` | detalhe com contagem de evidências |
| PATCH | `/inspections/[inspectionId]` | `QUALITY:EDIT` | edita (só PLANNED/EXECUTED) |
| DELETE | `/inspections/[inspectionId]` | `QUALITY:DELETE` | exclui (se PLANNED/CANCELLED) |
| POST | `/inspections/[inspectionId]/status` | `QUALITY:EDIT` | `EXECUTE`/`PASS`/`FAIL`/`CLOSE`/`REOPEN`/`CANCEL` |

Contrato de erro padrão: `{ error: { code, message, details?, correlation_id } }`.

---

## 7. Telas

- **`/projetos/[id]/qualidade`** — página principal (`quality-view.tsx`),
  server-side com os selectors. Espelho da tela de `/campo`.
- **`/qualidade`** — resumo por projeto (quadro agregado).
- Sidebar: item **"Qualidade"** (ícone `ClipboardCheck`); link "Qualidade (E13)"
  no cabeçalho do projeto.

Componentes da tela:
- **Quadro**: Modelos · Execuções em preenchimento · Inspeções abertas ·
  Planejadas · Reprovadas · Encerradas.
- **Aba Modelos**: editor de itens com obrigatoriedade (criar/editar/excluir).
- **Aba Execuções**: criar a partir de modelo (vinculando inspeção e
  responsável), responder item a item com `PASS`/`FAIL`/`NA` + observação,
  transições de status, excluir.
- **Aba Inspeções**: critério, data, vínculos WBS/atividade, contagem de
  evidências, transições com motivo/não conformidade, editar/excluir.

---

## 8. Limitações conhecidas (hoje)

1. **NCR e ação corretiva não existem** — a reprovação (`FAIL`) registra a não
   conformidade em `resultNotes`, mas não gera `NonConformity` nem
   `CorrectiveAction`. Em `FAILED`, o `CLOSE` **ainda é livre** (na Fatia 2
   passará a exigir NCR encerrado).
2. **Punch list não existe** (E13-US05, §34).
3. **Upload de foto pela UI não expõe `inspectionId`** — a tela de campo
   (legenda/diário/WBS/atividade) não tem o campo de inspeção; vincular foto a
   inspeção hoje é pela API (`inspectionId` no multipart) ou pela listagem
   `?inspectionId=`. O backend aceita e valida.
4. **Execução não pode ser editada após concluir** sem reabrir — por design
   (rastro de conformidade), mas exige o passo extra de `REOPEN`.
5. **Foto e checklist são formas de evidência equivalentes** na regra atual
   (`inspectionHasEvidence` usa OU).

---

## 9. Próximo passo (E13 Fatia 2)

`NonConformity` (NCR) + `CorrectiveAction` + punch list (E13-US03/US04/US05, §34),
com o fluxo §33 completo:

```
Planned → Executed → Passed / Failed → Corrective Action → Verification → Closed
```

Impacto previsto:
- Em `FAILED`, o `CLOSE` passará a exigir **NCR aberto e encerrado**.
- `resultNotes` da reprovação vira o conteúdo inicial do NCR.
- Nova entidade de punch list ligada a WBS/atividade/foto.

---

## 10. Verificação (gate da Fatia 1)

- `eslint` 0 problemas · `tsc --noEmit` limpo.
- **208 testes unitários** (15 em `tests/unit/quality-engine.test.ts`).
- **249 testes de integração** (21 em `tests/integration/quality.test.ts`).
- `next build` com 132 rotas (102 endpoints + 30 páginas).
- Migration `20261024120000_phase12_quality` aplicada no Neon; deploy
  `mici-ff842b4h4` (24/10) com smoke verde nas 3 rotas novas.

> Detalhamento diário em [`DIARIO.md`](DIARIO.md) (seção "24/10/2026 — E13
> Quality, Fatia 1").
