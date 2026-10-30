# Qualidade — fluxo de modelos, execuções, inspeções, NCR, ações corretivas e punch list (E13)

> Fonte: código em `src/modules/quality/`, `prisma/schema.prisma` (§33/§34) e
> registro em `DIARIO.md` (E13 Fatia 1, 24/10/2026; Fatia 2a, 27/10/2026;
> Fatia 2b, 29/10/2026).
> **Status: E13 completo e em produção** (modelos, execuções, inspeções, NCR,
> ação corretiva e punch list — Fatia 2b em produção desde 29/10, smoke
> verde).

---

## 1. Os sete conceitos

| Conceito | Entidade | O que é | Código |
|---|---|---|---|
| **Modelo de checklist** | `ChecklistTemplate` | Biblioteca de itens por projeto. Guarda **apenas texto + obrigatoriedade** — nunca resultado. | `CT001`, `CT002`… |
| **Execução de checklist** | `ChecklistExecution` | Uma "aplicação" do modelo para uma data/inspeção, com **snapshot congelado** dos itens e as respostas (`PASS`/`FAIL`/`NA` + observação). | `CE001`, `CE002`… |
| **Inspeção** | `Inspection` | Verificação planejada com **critério de aceite obrigatório**, data, responsável e vínculos WBS/atividade. É o "caso" que sustenta o resultado. | `IN001`, `IN002`… |
| **Não conformidade (NCR)** | `NonConformity` | O desvio constatado. **Nascida automaticamente** quando a inspeção falha (FAIL) — ou registrada manualmente. Gateia o encerramento da inspeção. | `NC001`, `NC002`… |
| **Ação corretiva** | `CorrectiveAction` | O que fazer para resolver o NCR, com **responsável e prazo**. Sem ela o NCR não anda. | `CA001`, `CA002`… |
| **Punch list** | `PunchItem` | Item de **correção menor** apurado na vistoria/entrega (§34): localização, descrição, prioridade, responsável, prazo, **foto do problema** e **foto da correção**; fluxo próprio com verificação. | `PX001`, `PX002`… |
| **Evidência** | `PhotoEvidence` | Foto de prova material. Pode ser vinculada a **inspeção** (`inspectionId`), **diário**, **WBS**, **atividade** ou **punch list** (`photoEvidenceId`/`correctionEvidenceId`). | `PH001`… |

Relações:
- Modelo **1 → N** Execuções (a execução guarda `templateCode`/`templateName` no snapshot).
- Inspeção **1 → N** Execuções (campo `inspectionId`, opcional; `ON DELETE SET NULL`).
- Inspeção **1 → N** Fotos (`inspectionId` em `photo_evidence`).
- Inspeção **1 → N** NCRs (`inspectionId` em `non_conformity`, `ON DELETE SET NULL`).
- NCR **1 → N** Ações corretivas (`nonConformityId`, exclusão em cascata).
- Projeto **1 → N** Punch items; punch item **N → 1** WBS/atividade (opcionais,
  `SET NULL`) e **N → 1** foto em cada um dos dois papéis (`photo_evidence_id`
  "como está", `correction_evidence_id` "como ficou"; `SET NULL`).

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
│                          │            │        ▲                        │
│                          │            │        └── exige NCR resolvido   │
│                          │            │           (encerrado/cancelado)  │
│                          │   ▲ sair de EXECUTED exige EVIDÊNCIA:        │
│                          │   │  foto vinculada (≥1) OU execução         │
│                          │   │  de checklist COMPLETED vinculada (≥1)   │
│                          │   └── REOPEN (de PASSED/FAILED) volta a      │
│                          │       EXECUTED                                │
│    CANCELLED ──REOPEN──► PLANNED                                         │
│    FAIL gera automaticamente um NCR (NCxxx) vinculado                    │
└───────────────────────────┬──────────────────────────────────────────────┘
                            │ NCR automático (ou manual)
                            ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 4. NÃO CONFORMIDADE (NonConformity) — NCxxx                              │
│    OPEN ──START──► CORRECTION ──SUBMIT──► VERIFICATION ──VERIFY──► CLOSED│
│      │                 │                        │                        │
│      │                 │                        └──REJECT──► CORRECTION  │
│      └──CANCEL (motivo)─┴──CANCEL (motivo)──► CANCELLED                  │
│    CLOSED ──REOPEN──► VERIFICATION · CANCELLED ──REOPEN──► OPEN          │
│    SUBMIT exige correctionNotes · VERIFY exige verificationNotes         │
└───────────────────────────┬──────────────────────────────────────────────┘
                            │ "nova ação corretiva" escolhe o NCR
                            ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 5. AÇÃO CORRETIVA (CorrectiveAction) — CAxxx                             │
│    OPEN ──START──► IN_PROGRESS ──COMPLETE──► DONE ──VERIFY──► VERIFIED   │
│      │                  │                       │             │         │
│      │                  │                       └──REJECT─┐   │         │
│      │                  │                       IN_PROGRESS◄──┘         │
│      │                  │                                    └─CLOSE──► │
│      │                  └──CANCEL (motivo)──► CANCELLED        CLOSED    │
│    CLOSED ──REOPEN──► VERIFIED · CANCELLED ──REOPEN──► OPEN             │
│    COMPLETE exige actionNotes · VERIFY exige verificationNotes          │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    │ paralelo — correções menores da
                                    │ vistoria/entrega (§34)
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 6. PUNCH LIST (PunchItem) — PXxxx                                        │
│    criar: localização, descrição, prioridade, responsável, prazo,        │
│           foto do problema (opcional) → status OPEN                      │
│    OPEN ──ASSIGN──► ASSIGNED ──START──► IN_PROGRESS ──SUBMIT──► READY    │
│                                                            FOR_VERIFICAT.│
│      └── (sem dono, ASSIGN falha)          │              │              │
│                                            │              ├──VERIFY──►   │
│                                            │              │  VERIFIED ── │
│                                            │              │  (CLOSE──►   │
│                                            │              │   CLOSED;    │
│                                            │              │   REJECT─┐   │
│                                            │              │  VERIFIED◄──┘│
│                                            │              └──REJECT──►   │
│                                            │                    REJECTED │
│                                            │                       │      │
│                                            │    SUBMIT exige foto da      │
│                                            │    correção (correctionEvidence│
│                                            │    Id); VERIFY exige         │
│                                            │    verificationNotes e grava  │
│                                            │    verifiedBy/At; REJECT     │
│                                            │    exige motivo e volta a     │
│                                            │    IN_PROGRESS               │
│                                            └── REOPEN (de REJECTED) ──────┘
│    CLOSED ──REOPEN──► VERIFIED · sem CANCELLED (descarte = soft delete)  │
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
   - No **FAIL**, um **NCR é criado automaticamente** com as `resultNotes`
     como descrição do desvio.
7. Abrir a **ação corretiva** no NCR (responsável + prazo) e conduzi-la até
   `VERIFIED`/`CLOSED`.
8. **Encerrar o NCR** (`VERIFY` com `verificationNotes` → `CLOSED`).
9. **Encerrar a inspeção** (`CLOSE`) — em `FAILED` só passa quando **todos os
   NCRs vinculados estiverem encerrados ou cancelados**.

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
- `FAIL` **exige** `resultNotes` (descrição da não conformidade) e **cria um
  NCR automaticamente** (`createNonConformityFromInspection`), com título
  `Não conformidade — {título da inspeção}` e as `resultNotes` como descrição.
- `PASS`/`FAIL` **exigem evidência**: `inspectionHasEvidence` →
  `photoCount > 0 || completedChecklists > 0`.
- `CLOSE` vindo de `FAILED` **exige o NCR resolvido**: conta NCRs vinculados
  com `status NOT IN (CLOSED, CANCELLED)` — se houver algum, `CONFLICT`
  ("Encerrar inspeção reprovada exige a não conformidade encerrada…").
- `CANCEL` exige motivo.
- Exclusão lógica **só** em `PLANNED` ou `CANCELLED`; executa-se "cancelar"
  para preservar a trilha.

### 3.3 Não conformidade — NCR (`engine.ts` + `nonconformities.ts`)

| Status | Rótulo PT | Ações disponíveis | Editável? |
|---|---|---|---|
| `OPEN` | Aberta | `START`, `CANCEL` | sim |
| `CORRECTION` | Em correção | `SUBMIT`, `CANCEL` | sim |
| `VERIFICATION` | Em verificação | `VERIFY`, `REJECT`, `CANCEL` | não (histórico) |
| `CLOSED` | Encerrada | `REOPEN` (→ VERIFICATION) | não |
| `CANCELLED` | Cancelada | `REOPEN` (→ OPEN) | não |

Regras do writer (`nonconformities.ts`):
- `SUBMIT` exige `correctionNotes` (o que foi feito); grava `correctedAt`.
- `VERIFY` exige `verificationNotes` (como foi conferido); grava
  `verifiedAt` + `closedAt` — encerra de fato.
- `CANCEL` exige motivo; `REOPEN` de `CLOSED` limpa `verifiedAt`/`closedAt`.
- Só edita (título/descrição) em `OPEN`/`CORRECTION`; exclusão lógica também
  só nesses status (verificação/encerrada viram histórico).
- **Resolvido** = `CLOSED` ou `CANCELLED` (`isNonConformityResolved`) — é o
  predicado que libera o `CLOSE` da inspeção reprovada.

### 3.4 Ação corretiva (`engine.ts` + `corrective-actions.ts`)

| Status | Rótulo PT | Ações disponíveis | Editável? |
|---|---|---|---|
| `OPEN` | Aberta | `START`, `CANCEL` | sim |
| `IN_PROGRESS` | Em andamento | `COMPLETE`, `CANCEL` | sim |
| `DONE` | Concluída | `VERIFY`, `REJECT` (→ IN_PROGRESS) | não |
| `VERIFIED` | Verificada | `CLOSE`, `REJECT` (→ IN_PROGRESS) | não |
| `CLOSED` | Encerrada | `REOPEN` (→ VERIFIED) | não |
| `CANCELLED` | Cancelada | `REOPEN` (→ OPEN) | não |

Regras do writer (`corrective-actions.ts`):
- Vinculada a um NCR **vivo do mesmo projeto**; NCR `CANCELLED` **não aceita**
  ações corretivas (`CONFLICT`).
- `COMPLETE` exige `actionNotes`; `VERIFY` exige `verificationNotes`;
  `CANCEL` exige motivo.
- Só edita (título/descrição/responsável/prazo) em `OPEN`/`IN_PROGRESS`.
- Responsável precisa ser membro ativo do projeto (`assertMember`).

### 3.5 Punch list (`engine.ts` + `punch-items.ts`)

| Status | Rótulo PT | Ações disponíveis | Editável? |
|---|---|---|---|
| `OPEN` | Aberto | `ASSIGN` (→ ASSIGNED) | sim |
| `ASSIGNED` | Atribuído | `START` (→ IN_PROGRESS) | sim |
| `IN_PROGRESS` | Em correção | `SUBMIT` (→ READY_FOR_VERIFICATION) | sim |
| `READY_FOR_VERIFICATION` | Pronto para verificação | `VERIFY` (→ VERIFIED), `REJECT` (→ REJECTED) | não (histórico) |
| `VERIFIED` | Verificado | `CLOSE` (→ CLOSED), `REJECT` (→ REJECTED) | não |
| `REJECTED` | Reprovado | `REOPEN` (→ IN_PROGRESS) | não |
| `CLOSED` | Encerrado | `REOPEN` (→ VERIFIED) | não |

Sem `CANCELLED` (a spec §34 não define cancelamento): o descarte é exclusão
lógica enquanto o item é editável — depois disso, reabra para editar.

Regras do writer (`punch-items.ts`):
- `ASSIGN` exige responsável (`ownerId` no payload ou já gravado no item);
  validado como membro ativo.
- `SUBMIT` exige **foto da correção** (`correctionEvidenceId` no payload ou
  já gravada) — a §33 "evidência adequada" aplicada ao item.
- `VERIFY` exige `verificationNotes` e grava `verifiedById` (ator) +
  `verifiedAt`; `REJECT` exige `reason` (motivo) e grava `rejectReason`.
- `REOPEN` de `CLOSED` limpa `closedAt` e volta a `VERIFIED` (re-verificação).
- Só edita (localização/descrição/prioridade/responsável/prazo/vínculos/fotos)
  em `OPEN`/`ASSIGNED`/`IN_PROGRESS`; exclusão lógica nos mesmos status.
- Fotos (problema e correção) precisam pertencer ao mesmo projeto; responsável
  é membro ativo; WBS/atividade validados por `assertFieldLinks`.
- `isPunchItemOverdue`: vencido = prazo (DATE) anterior a **hoje** e status
  diferente de `CLOSED` — usado no board (`punchItemsOverdue`).

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
- `FAIL` exige não conformidade descrita (`resultNotes`) e **gera o NCR**
  (audit `CREATE` + evento `Quality.NonConformity.Created` com `auto: true`).
- `CLOSE` de `FAILED` gateado nos NCRs vinculados (ver §3.2).
- Inspeção executada não é excluível — cancele para preservar a trilha.

**Não conformidade (`nonconformities.ts`)**
- Pode nascer automática (FAIL) ou manual (com `inspectionId` opcional).
- Idempotência offline por `clientUuid` (`@@unique([projectId, clientUuid])`).
- Transições conforme §3.3; notas obrigatórias validadas no writer.
- Exclusão lógica só em `OPEN`/`CORRECTION`.

**Ação corretiva (`corrective-actions.ts`)**
- `nonConformityId` obrigatório e do mesmo projeto; NCR cancelado bloqueado.
- Responsável validado como membro; prazo (`dueDate`) opcional.
- Idempotência offline por `clientUuid`; transições conforme §3.4.
- Exclusão lógica só em `OPEN`/`IN_PROGRESS`.

**Punch list (`punch-items.ts`)**
- `location`/`description` obrigatórios; prioridade reutiliza `FieldPriority`
  (LOW/MEDIUM/HIGH/CRITICAL, padrão MEDIUM).
- Idempotência offline por `clientUuid`; transições conforme §3.5.
- Exclusão lógica só em `OPEN`/`ASSIGNED`/`IN_PROGRESS`.
- Vínculos WBS/atividade e as duas fotos validados contra o projeto.

**Transversal (módulo `common.ts`, reutiliza o módulo de campo)**
- Escopo de tenant sempre validado (`assertQualityProject`).
- Código automático por projeto: `CT` (modelo), `CE` (execução),
  `IN` (inspeção), `NC` (NCR), `CA` (ação corretiva), `PX` (punch list) —
  sequencial de 3 dígitos (`CT001`).
- Idempotência offline por `clientUuid` (`@@unique([projectId, clientUuid])`
  em execução, inspeção, NCR, ação corretiva e punch item): reenvio devolve o
  registro original.
- Toda escrita gera `AuditEvent` (CREATE/UPDATE/DELETE/ação) e `DomainEvent`
  (`Quality.ChecklistTemplate.*`, `Quality.ChecklistExecution.*`,
  `Quality.Inspection.*`, `Quality.NonConformity.*`, `Quality.CorrectiveAction.*`,
  `Quality.PunchItem.*`).
- Campos de data: `inspectionDate`, `dueDate` (DATE) e datas de transição
  (`executedAt`, `closedAt`, `completedAt`, `correctedAt`, `verifiedAt`).

---

## 5. Evidência (a regra do §33 na prática)

A inspeção só pode sair de `EXECUTED` para `PASSED`/`FAILED` com prova material:

| Tipo | Como vincular hoje | Onde contar |
|---|---|---|
| **Foto de evidência** | Upload em `POST /api/v1/projects/[id]/field/photos` com o campo `inspectionId`; filtro de listagem `?inspectionId=` | `photoEvidence.count({ inspectionId, deletedAt: null })` |
| **Checklist concluído** | Criar a execução com `inspectionId` e concluir (`COMPLETED`) | `checklistExecution.count({ inspectionId, status: "COMPLETED" })` |

Mostrado na tela de inspeções como `N foto(s) · M checklist(s) concluído(s)`.

---

## 6. API (30 rotas)

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
| GET | `/non-conformities` | `QUALITY:VIEW` | lista (`?status=`, `?inspectionId=`) |
| POST | `/non-conformities` | `QUALITY:CREATE` | cria NCR manual (`NCxxx`) |
| GET | `/non-conformities/[nonConformityId]` | `QUALITY:VIEW` | detalhe |
| PATCH | `/non-conformities/[nonConformityId]` | `QUALITY:EDIT` | edita (só OPEN/CORRECTION) |
| DELETE | `/non-conformities/[nonConformityId]` | `QUALITY:DELETE` | exclui (se OPEN/CORRECTION) |
| POST | `/non-conformities/[nonConformityId]/status` | `QUALITY:EDIT` | `START`/`SUBMIT`/`VERIFY`/`REJECT`/`CANCEL`/`REOPEN` |
| GET | `/corrective-actions` | `QUALITY:VIEW` | lista (`?status=`, `?nonConformityId=`) |
| POST | `/corrective-actions` | `QUALITY:CREATE` | cria ação corretiva (`CAxxx`) |
| GET | `/corrective-actions/[correctiveActionId]` | `QUALITY:VIEW` | detalhe |
| PATCH | `/corrective-actions/[correctiveActionId]` | `QUALITY:EDIT` | edita (só OPEN/IN_PROGRESS) |
| DELETE | `/corrective-actions/[correctiveActionId]` | `QUALITY:DELETE` | exclui (se OPEN/IN_PROGRESS) |
| POST | `/corrective-actions/[correctiveActionId]/status` | `QUALITY:EDIT` | `START`/`COMPLETE`/`VERIFY`/`REJECT`/`CLOSE`/`CANCEL`/`REOPEN` |
| GET | `/punch-items` | `QUALITY:VIEW` | lista (`?status=`) |
| POST | `/punch-items` | `QUALITY:CREATE` | cria item (`PXxxx`) |
| GET | `/punch-items/[punchItemId]` | `QUALITY:VIEW` | detalhe |
| PATCH | `/punch-items/[punchItemId]` | `QUALITY:EDIT` | edita (só OPEN/ASSIGNED/IN_PROGRESS) |
| DELETE | `/punch-items/[punchItemId]` | `QUALITY:DELETE` | exclui (se OPEN/ASSIGNED/IN_PROGRESS) |
| POST | `/punch-items/[punchItemId]/status` | `QUALITY:EDIT` | `ASSIGN`/`START`/`SUBMIT`/`VERIFY`/`REJECT`/`CLOSE`/`REOPEN` |

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
  Planejadas · Reprovadas · Encerradas · NCR abertas · Ações corretivas
  abertas · Punch list abertos · Punch list vencidos.
- **Aba Modelos**: editor de itens com obrigatoriedade (criar/editar/excluir).
- **Aba Execuções**: criar a partir de modelo (vinculando inspeção e
  responsável), responder item a item com `PASS`/`FAIL`/`NA` + observação,
  transições de status, excluir.
- **Aba Inspeções**: critério, data, vínculos WBS/atividade, contagem de
  evidências, transições com motivo/não conformidade, editar/excluir.
- **Aba Não conformidades**: título/descrição, inspeção de origem, contagem
  de ações corretivas (com total de abertas em destaque), transições do fluxo
  NCR, editar/excluir (só em OPEN/CORRECTION).
- **Aba Ações corretivas**: NCR de origem, responsável, prazo, transições do
  fluxo, editar/excluir (só em OPEN/IN_PROGRESS).
- **Aba Punch list**: localização, descrição, prioridade, responsável, prazo
  (vencido destacado em vermelho), status, transições do fluxo, editar/excluir
  (só em OPEN/ASSIGNED/IN_PROGRESS); o diálogo de criação/edição inclui foto
  do problema, WBS e atividade (opções carregadas via `listPhotos`).

Diálogo único de transição (compartilhado por todos os fluxos): escolhe a
ação e pede a nota obrigatória da virada (não conformidade no `FAIL`,
`correctionNotes` no `SUBMIT`, `verificationNotes` no `VERIFY`, `actionNotes`
no `COMPLETE`), o motivo no `CANCEL`/`REJECT`, o responsável no `ASSIGN` de
punch item e a **foto da correção** no `SUBMIT` de punch item.

---

## 8. Limitações conhecidas (hoje)

1. **Execução não pode ser editada após concluir** sem reabrir — por design
   (rastro de conformidade), mas exige o passo extra de `REOPEN`.
2. **Foto e checklist são formas de evidência equivalentes** na regra atual
   (`inspectionHasEvidence` usa OU).
3. **NCR automático é 1 a cada FAIL** — reprovar de novo a mesma inspeção
   (após REOPEN) gera um novo NCR; não há deduplicação por inspeção.
4. **Encerrar NCR não exige ação corretiva** — o gate do `CLOSE` da inspeção
   checa apenas o status do NCR; a spec prevê "Failed → Corrective Action",
   mas hoje é opcional (sem CA o NCR ainda precisa de `correctionNotes` e
   `verificationNotes` para fechar).
5. **Punch list não se liga a NCR/inspeção** — a §34 não exige vínculo
   obrigatório; hoje o item se liga a projeto/WBS/atividade/fotos, e a
   associação a uma inspeção específica pode ser feita via atividade.

---

## 9. Próximo passo

**E13 fechado no código** (Fatia 1 + 2a + 2b). O fluxo §33 completo está de pé:

```
Planned → Executed → Passed / Failed → Corrective Action → Verification → Closed
```

com a punch list (§34) cobrindo as correções menores da vistoria/entrega.

Pendências operacionais: **deploy da Fatia 2b** (migration `phase14_punch` no
Neon + `vercel --prod`) — fica para quando o usuário pedir.

---

## 10. Verificação (gate da Fatia 2b)

- `eslint` 0 problemas · `tsc --noEmit` limpo.
- **226 testes unitários** (incluindo máquina punch, `isPunchItemOverdue` e
  board com punch list em `tests/unit/quality-engine.test.ts`).
- **266 testes de integração** (incluindo PX001 + idempotência, fluxo
  completo ASSIGN→CLOSE, REJECT com motivo, foto de outro projeto barrada,
  vencido por prazo e isolamento de tenant em
  `tests/integration/quality.test.ts`).
- Migration `20261029120000_phase14_punch` (enum `punch_item_status` +
  tabela `punch_items` + FKs para foto/WBS/atividade) — aplicada localmente
  (dev e `mici_test`) e **no Neon em 29/10** (via `prisma migrate deploy`).
- Deploy da Fatia 2b: commit `01a0966` (29/10) → `mici-nb8dr9z1l-homeland1`
  (alias `mici-theta.vercel.app`), smoke verde nas rotas de punch
  (`/quality/punch-items` → 200 `{"punchItems":[]}`). Deploy da Fatia 2a:
  commit `762b55c` (27/10) → `mici-7fzp222qm-homeland1`, smoke verde nas
  rotas de NCR/CA. Deploy da Fatia 1: `mici-ff842b4h4` (24/10).

> Detalhamento diário em [`DIARIO.md`](DIARIO.md) (seções "24/10/2026 — E13
> Quality, Fatia 1", "27/10/2026 — E13 Quality, Fatia 2a" e
> "29/10/2026 — E13 Quality, Fatia 2b (punch list)").
