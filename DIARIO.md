# DIÁRIO DE DESENVOLVIMENTO — MICI SaaS

Registro cronológico do que foi feito — **fim histórico, não é fonte de
retomada** (desde 29/10/2026). Para voltar ao desenvolvimento, usar
**`devcurrent.md`** (estado atual, ambiente, comandos e próxima frente).
Este arquivo continua sendo atualizado por sessão para memória futura.
Fontes: este arquivo, `ROADMAP.md`, histórico git e ADRs. Datas em
DD/MM/AAAA.

---

## 03/10/2026 — Fundação, Identidade e Portfólio

### Fase 0 — Foundation (E01 + base de E02)

- Scaffold **Next.js 16 + TypeScript + Tailwind 4** com configs de
  lint/typecheck/format e CI (GitHub Actions: lint → typecheck → test → build).
- **Prisma 7** com schema base de tenancy: organizações, usuários,
  memberships, papéis, permissões, auditoria append-only (§54), outbox
  `domain_events` e fila `job_queue` (ADR-009).
- Migration `init_foundation_identity` aplicada + seed idempotente: catálogo
  de ~200 permissões, 18 papéis por organização, org demo e 5 usuários demo.
- **Auth.js v5** (JWT + scrypt), página `/entrar`, sessão com cookie de
  contexto de tenant (`mici_active_org`) validado contra memberships — o
  `organization_id` nunca vem do body da requisição (§10.4).
- APIs base: `/api/v1/session/context`, `/api/v1/organizations`,
  `/api/v1/health`; shell do app (sidebar/topbar/org switcher) e `/painel`.
- **RBAC** com matriz 18 papéis × módulos × ações, função `can()` e testes
  unitários (15 testes).
- Contrato de erro único da API (código + status + `correlation_id`, §114).
- **ADR-014**: desvio da spec original (Django + React) para **Next.js
  full-stack** no mesmo monolito modular — épicos válidos, stack diferente.
- **ADR-015**: filas em Postgres + Vercel Cron no MVP (sem Redis).
- Commits: `feat: Fase 0 Foundation…`, README com runbook.

### Fase 1 — Identity/Tenancy (E02)

- UI de administração: `/administracao/usuarios` (usuários, convites, papéis),
  `/administracao/papeis` (matriz de permissões).
- Troca de organização completa + guarda de rotas
  (`/selecionar-organizacao` + guards em layout e `/entrar`).
- Testes automatizados de isolamento de tenant no CI
  (`tests/integration/tenant-isolation.test.ts`, 13 testes).
- Trilha de auditoria visível em `/administracao/auditoria` com filtros e
  histórico por objeto.
- Salvaguardas: auto-bloqueio de editar a própria membresia, proteção do
  último ADMIN ativo, papéis do sistema imutáveis.
- Commit: `feat: Fase 1 Identity/Tenancy…`.

### Fase 2 — Portfólio (E03) + Gates (E06)

- CRUD Project/Client/ProjectTemplate com validação e escopo de tenant
  (`/projetos`, `/clientes`, `/templates` + 6 endpoints `/api/v1`).
- Gates G0–G8 oficiais (§17/§18) criados por organização; gates customizados
  em `/administracao/gates`.
- `GateInstance` com snapshot imutável de critérios na criação do projeto
  (§15.1), evidências e aprovações múltiplas (`minimumApprovals`).
- **BR-001** (avanço de fase exige gates aprovados/dispensados) e **BR-002**
  (aprovação exige critérios obrigatórios + evidência) com auditoria de
  decisão (start/submit/analyze/approve/reject/waive).
- Detalhe de projeto com stepper de fases F0–F10 e tabela de gates.
- Testes: 15 unit do motor de gates + 16 de integração
  (`project-gates.test.ts`, inclui isolamento cross-tenant).
- Commits: `feat: Fase 2 Portfolio/Gates…`.

### Deploy e ferramentas

- Runbook de deploy **Vercel + Neon** (produção) — commit docs.
- Fix: timeout de transação de bootstrap para bancos remotos + utilitário de
  senha demo.

---

## 04/10/2026 — Fase 3 concluída e verificada

### Requisitos/DRP (E04) + WBS (E05)

- Migration `phase3_requirements_wbs`: `Requirement`, `RequirementRevision`,
  `RequirementEvidence`, `WBSNode`, `WBSVersion`.
- Requisitos versionados (toda edição gera revisão), máquina de estados de
  status, vínculo com WBS, evidências (**BR-008**) e regra **BR-015** para
  categoria COMPLIANCE.
- Geração de **DRP** (§20) em `/api/v1/projects/[id]/drp`, página
  `/projetos/[id]/requisitos` e visão global `/requisitos`.
- Árvore de **WBS** com numeração automática, reordenação, mover, duplicar,
  importação (merge por código, preserva payload original — §0.1 regra 18) e
  exportação JSON/CSV em `/projetos/[id]/wbs`; versionamento da árvore
  (`WBSVersion`).
- **Gate G1** passa a exigir DRP completo (§18-G1) com
  `REQUIREMENTS_INCOMPLETE` listando bloqueios.
- 16 endpoints `/api/v1` + testes: 38 unit (motores de requisitos e WBS) e 29
  de integração.
- Gate da Fase 3 verificado: lint · typecheck · 68 unit · 58 integration ·
  build (55 rotas) ✅.

> Observação: o trabalho da Fase 3 ainda **não foi commitado** (arquivos
> untracked no repositório local).

---

## 07/10/2026 — Correções de ambiente e sessão

### Split-brain de banco em `/selecionar-organizacao`

Sintoma: aviso "Sessão expirada ou ausente." junto de "Olá, Paulo" e
"Você ainda não participa de nenhuma organização".

Causa raiz: o cookie JWT foi emitido contra o Postgres local (seed de 03/10),
mas o `next dev` passou a ler o `DATABASE_URL` do `.env.local` (Neon,
`vercel env pull` de 03/10). `userId` órfão no banco ativo ⇒ `POST
/api/v1/organizations` respondia 401 e a lista de orgs vinha vazia; a sessão
*parecia* válida porque o JWT é stateless.

- `.env.development.local` novo — fixa o `DATABASE_URL` local para `next dev`
  (precedência confirmada sobre `.env.local` via `@next/env`); Neon continua
  valendo para `build`/`start`.
- `src/lib/auth.ts` — callback `session` revalida `token.userId` no banco;
  id inativo/huérfão remove `session.user.id` ⇒ redirect ou 401, em vez de
  tela "logada" com backend rejeitando.
- `src/modules/identity/services.ts` — `createOrganization` distingue usuário
  inexistente (`SESSION_USER_NOT_FOUND`, 401) de desativado (`FORBIDDEN`).
- Ambiente local recriado: Docker Desktop + `docker compose up -d`, migrations
  e seed idempotente (5 usuários demo, org `demo`).

### `JWTSessionError` em `/entrar`

- O callback `session` ganhou try/catch (`src/lib/auth.ts`): qualquer falha de
  banco dentro do callback deixou de virar `JWTSessionError` opaca (o Auth.js
  embrulha **qualquer** erro do callback como JWTSessionError — `@auth/core`
  `lib/actions/session.ts:86`) e passa a degradar para "não autenticado" com
  `console.warn` da causa real.
- Causa raiz do erro daquela sessão: **banco local fora do ar** (Docker
  parado, porta 5432 fechada).

---

## 08/10/2026 — Retomada: gate da Fase 3 + E07 fatia 1

### Manhã — fechar o gate da Fase 3

- Postgres local no ar (Docker healthy); `npm run dev` reiniciado de limpo
  (o processo antigo carregava o env antigo) — env listado:
  `.env.development.local` primeiro.
- Smoke test de login automatizado via HTTP (csrf + credentials): `admin@mici.demo`
  → `/painel` 200, `/selecionar-organizacao` 200, `/api/v1/session/context` e
  `/api/v1/organizations` 200 — **sem `JWTSessionError`**.
- Suíte completa ✅: lint · typecheck · 68 unit · 58 integration · build
  (55 rotas). Pendências antigas do ROADMAP fechadas.

### Tarde — Fase 4 / E07, fatia "atividades + dependências + CPM"

- **Migration `phase4_schedule`** — enums `ActivityType` (TASK/MILESTONE/
  SUMMARY), `ActivityStatus`, `DependencyType` (FS/SS/FF/SF), `ProgressMethod`;
  models `ScheduleActivity` (spec §27), `ScheduleDependency`
  (predecessor/sucessor + type + lag) e `ProjectCalendar` (antecipa E07-US03),
  todos com `organization_id`/`project_id` + índices.
- **Módulo `src/modules/schedule/`** (espelha `src/modules/wbs/`):
  - `engine.ts` — **CPM puro**: epoch-day UTC, forward/backward pass,
    `totalFloat`, `critical` (≤0), detecção de ciclo (Kahn), lag/lead nos 4
    tipos, duração por calendário (semana útil + feriados), marco de duração
    0, teto do LF no fim do projeto (atraso não pode estender o término).
  - `activities.ts` — CRUD, código automático `A001…`, marco exige duração 0,
    datas validadas, vínculo WBS/calendário validados, avanço físico
    (COMPLETED força 100%), exclusão bloqueada por dependências, auditoria +
    domain events.
  - `dependencies.ts` — FS/SS/FF/SF com lag, duplicidade/auto-dependência/
    ciclo rejeitados (ciclo validado rodando o próprio motor).
  - `cpm.ts` — `recalculateSchedule`: recalcula **sempre** antes de persistir
    `total_float`/`critical` (§27: não tratar `critical` como verdade própria).
  - `selectors.ts`, `schemas.ts` (zod).
- **6 endpoints** `/api/v1/projects/[id]/*` com `apiHandler` +
  `assertPermission("SCHEDULE", …)`: `activities` (GET/POST),
  `activities/[id]` (PATCH/DELETE), `activities/[id]/progress` (POST),
  `dependencies` (GET/POST), `dependencies/[id]` (DELETE),
  `schedule/cpm` (GET).
- **Tela** `/projetos/[id]/cronograma` (server component) + `ScheduleView`
  (client): tabela de atividades com float/crítico/avanço, gestão de
  dependências e botão "Recalcular CPM"; link "Cronograma (E07)" no detalhe
  do projeto; item global no `nav-items.ts` continua `soon`
  (08/10, depois: habilitado com a visão global `/cronograma`).
- **Testes**: `tests/unit/schedule-engine.test.ts` (12 — FS/SS/FF/SF com
  lag/lead, marco, ciclo, float, feriado) e `tests/integration/schedule.test.ts`
  (17 — CRUD, permissão, isolamento cross-tenant, recálculo CPM).
- **Gate** ✅: lint · typecheck · **80 unit** · **75 integration** ·
  build **62 rotas**; smoke manual da tela e das APIs de schedule.
- Aprendizado registrado: após `prisma generate`, reiniciar `npm run dev`
  (o Turbopack mantém o client Prisma antigo em cache → `500` com
  `prisma.schedule*` undefined).
- Atualização do `ROADMAP.md` (status snapshot, gates e Épico E07 🟦) e
  criação deste diário.

### Tarde (continuação) — E07 fatia 2: baseline SCHEDULE + forecast

**Status salvo e diário criados** antes de entrar na fatia 2 (`ROADMAP.md`
ganhou a seção "Status do desenvolvimento (snapshot)" e este `DIARIO.md`
foi criado com todo o histórico).

- **Migration `phase4_schedule_baseline`** — enums `BaselineType`
  (SCOPE/SCHEDULE/COST/SUSTAINABILITY) e `BaselineStatus`
  (DRAFT/SUBMITTED/APPROVED/SUPERSEDED) + model `Baseline` (§28): snapshot
  `Json` auto-contido, `version` única por projeto+tipo, `approvedAt/By`,
  sem `updatedAt` (registro imutável por natureza).
- **Forecast (E07-US05)** — `computeForecast` puro em `engine.ts`: forward
  pass com dados reais; CONCLUÍDA ancora em `actualFinish`/`actualStart` e
  propaga o fim real; EM_ANDAMENTO usa piso no início real + duração
  remanescente (`ceil(d × (100 − progresso)/100)`); demais seguem o CPM.
  `cpm.ts` passou a persistir `forecastStart`/`forecastFinish` junto de
  float/crítico e a expor `forecastFinish` no resumo; `updateActivityProgress`
  agora dispara o recálculo (o forecast deriva do realizado).
- **Baseline (E07-US04)** — `src/modules/schedule/baselines.ts`: criação de
  snapshot (captura atividades + dependências + `capturedAt`), fluxo
  DRAFT → SUBMITTED → APPROVE com REJECT de volta, aprovação substitui
  (SUPERSEDED) a baseline aprovada anterior do mesmo tipo, exclusão só de
  DRAFT/SUBMITTED; APPROVED/SUPERSEDED respondem `BASELINE_IMMUTABLE`
  (alteração real exige ChangeRequest — E11); auditoria com
  `objectType: "Baseline"`.
- **Endpoints** — `baselines` (GET/POST), `baselines/[baselineId]`
  (GET/DELETE), `baselines/[baselineId]/status` (POST com
  `action=SUBMIT|APPROVE|REJECT`; `APPROVE` exige `SCHEDULE:APPROVE`).
- **Tela** `/projetos/[id]/cronograma` — colunas "Prev. início" e "Prev. fim"
  na tabela de atividades + seção "Baselines" com status, contagem do
  snapshot e ações (submeter, aprovar, rejeitar, excluir) + diálogo de
  criação com motivo; permissão `SCHEDULE:APPROVE` vira prop da `ScheduleView`.
- **Testes** — +5 unit (`forecast (E07-US05)`: âncora do realizado, atraso
  propagado, duração remanescente, 100% sem data, igualdade com o CPM sem
  execução) e +12 integração (`tests/integration/schedule-baseline.test.ts`:
  forecast persistido, ciclo de vida completo, imutabilidade, snapshot
  estável, permissão e isolamento de tenant).
- **Gate** ✅: lint · typecheck · **85 unit** · **87 integration** ·
  build (62 rotas; +3 de baseline).
- **Smoke** ✅ via HTTP autenticado: `/projetos/[id]/cronograma` 200 ·
  `GET activities`/`schedule/cpm`/`baselines` 200 · criar + `SUBMIT` 200 ·
  `APPROVE` 200 · `DELETE` de aprovada → **409 `BASELINE_IMMUTABLE`**.
  Baselines residuais do smoke removidas do banco dev (`DELETE FROM baselines`).
- Aprendizado novo: `prisma generate` de novo → reiniciar `npm run dev`
  (página deu `500` com `prisma.baseline` undefined; dev reiniciado via
  `cmd /c cd … && npm run dev`). Registro atualizado no ROADMAP.

### Fase 4 / E07, fatia 3 — calendários (US03) — Épico E07 fechado

- **`src/modules/schedule/calendars.ts`** — CRUD de `ProjectCalendar` com
  dois escopos (PROJECT e ORGANIZATION, `projectId` nulo): validação de
  semana útil (1–7 dias, valores 0–6, sem repetição), feriados (AAAA-MM-DD
  com data realmente existente), código único por organização, um
  `isDefault` por escopo (o novo default limpa os anteriores do mesmo escopo
  em transação), exclusão lógica **bloqueada enquanto houver atividade
  vinculada** (mensagem com a contagem) e recálculo dos projetos afetados
  (quem usa o calendário + escopo do default; default de organização
  recalcula todos os projetos vivos da org).
- **Default no CPM** — `loadDefaultCalendarSpec` em `selectors.ts`
  (default do projeto → default da organização → `null` ⇒ seg–sex) agora é
  passado como `defaultCalendar` em `cpm.ts`; atividades sem calendário
  próprio passam a respeitar feriados/semana do default do escopo.
- **Endpoints** — `calendars` (GET/POST) e `calendars/[calendarId]`
  (PATCH/DELETE) com `SCHEDULE:VIEW/CREATE/EDIT/DELETE`; zod em
  `createCalendarSchema`/`updateCalendarSchema` (escopo não muda depois de
  criado).
- **Tela** `/projetos/[id]/cronograma` — seção "Calendários" (tabela com
  escopo, semana útil, nº de feriados e badge Padrão + editar/excluir),
  diálogo com checkboxes da semana e textarea de feriados, e select de
  calendário no formulário da atividade ("— Padrão (seg–sex) —").
- **Testes** — +1 unit (`defaultCalendar cobre atividades sem calendário
  próprio`) e +11 integração (`tests/integration/schedule-calendars.test.ts`):
  CRUD, código duplicado (409), validações (semana vazia, feriado número,
  `2026-02-31`), escopo organização, default único por escopo, **precedência
  do default do projeto sobre o da organização no CPM** (feriado da org só
  vale quando o default do projeto é removido), atividade vinculada +
  recálculo ao mudar feriados, exclusão bloqueada por vínculo, permissão e
  isolamento de tenant.
- **Gate** ✅: lint · typecheck · **86 unit** · **98 integration** · build
  **64 rotas** (+2 de calendários).
- **Smoke** ✅ autenticado: página 200 · `GET/POST calendars` 201 ·
  duplicado **409** · `PATCH` 200 (v2) · `DELETE` 200 · lista volta a 0
  (sem resíduo).

### Item "Cronograma" do menu global habilitado

O item em `nav-items.ts` estava com `soon: true` porque a rota global não
existia (o cronograma era só por projeto). Feito:

- Nova página **`/cronograma`** (visão única da organização, espelhando
  `/requisitos`): uma linha por projeto com atividades, críticas (badge),
  avanço médio e fim previsto (`forecastFinish` persistido), com link
  "Abrir" para `/projetos/[id]/cronograma`; guarda `SCHEDULE:VIEW`.
- Seletor `listScheduleSummaries` em `selectors.ts` (dois `groupBy` de
  `scheduleActivity`: totais + críticas).
- `nav-items.ts`: `{ label: "Cronograma", href: "/cronograma" }` (sem
  `soon`).
- Teste de integração do resumo (+1) e gate reexecutado ✅: lint ·
  typecheck · 86 unit · **99 integração** · build 65 rotas · smoke `/painel`
  200 e `/cronograma` 200.

### E07 import — importação MS Project (CSV/XML) + templates de cronograma + aplicar calendário (08/10)

Feature pedida antes do E08: importar cronograma do MS Project pelo menu
Cronograma, salvar templates reutilizáveis no menu Templates e, após o
import, aplicar um calendário a todo o cronograma recalculando as datas.

- **Formatos (amostras reais na raiz, copiadas para `tests/fixtures/`)** —
  CSV (separator `;`, cabeçalhos PT-BR, datas dd/MM/AAAA, predecessoras
  `7;8` ou `3FS+2d`, Sim/Não, Tipo ∈ Marco/Tarefa/Resumo) e XML schema
  `microsoft.com/project` (`<Task>`, `PredecessorLink` Type 1–4,
  `Duration PT8H0M0S` → dias = horas ÷ MinutesPerDay/60, `Calendars` →
  semana útil, resumo rederivado do span útil porque o MS grava horas de
  calendário corrido). Esperado: **66 tarefas, 74 dependências, 11 marcos,
  10 resumos** em ambos os formatos (cross-check campo a campo no teste).
- **Parser puro** `src/modules/schedule/msproject.ts` (sem I/O): dispatch
  por extensão/sniff, limites 5000 atividades / 5M chars, warnings
  (predecessora inválida, lag em unidade não-dia, exceções de calendário).
- **Importador** `src/modules/schedule/importer.ts` — `importSchedule`
  valida o grafo ANTES de escrever (ids únicos, deps só para não-resumo,
  ciclo via `computeCpm`) e numa transação faz **replace-all** (hard delete
  das atividades/dependências do projeto, inclusive soft-deleted — senão o
  unique `[projectId, code]` barra a renumeração), recria com `A001..`,
  religa o WBS pelo código do arquivo, ancora `project.startDate` se nulo,
  audita `IMPORT` + `Schedule.Imported` e recalcula o CPM. Status: 100% →
  COMPLETED com actuals do arquivo; >0 → IN_PROGRESS.
- **Aplicar calendário** `applyCalendarToSchedule`: vincula o calendário a
  todas as atividades (calendário do projeto vira `isDefault`), recalcula,
  persiste `earlyStart/earlyFinish` no planejado das não concluídas e
  recalcula de novo (audita `CALENDAR_APPLY`).
- **Templates** model `ScheduleTemplate` (migration
  `phase5_schedule_import`, code `ST001..`, snapshot `Json` = ParsedSchedule)
  + módulo `templates.ts` + rotas `GET/POST /api/v1/schedule-templates` e
  `DELETE /[templateId]` (`SCHEDULE:VIEW/CREATE/DELETE`). A aplicação é
  pelo diálogo de import do cronograma (`templateId`), não pela página.
- **Endpoints** `POST /projects/[id]/schedule/import` (`SCHEDULE:EDIT`;
  corpo JSON `{filename, content}` ou `{templateId}` + `calendarId?` — não
  multipart porque `apiRequest` força JSON) e
  `POST /projects/[id]/schedule/apply-calendar` (`SCHEDULE:EDIT`).
- **Telas** — botão **Importar** em `/projetos/[id]/cronograma` (diálogo:
  arquivo CSV/XML ou template + calendário opcional + aviso de substituição,
  mostra contagens/avisos/warnings após import); botão **Aplicar ao
  cronograma** por linha de calendário; seção **Templates de cronograma** em
  `/templates` (upload, contagens, excluir; aplicar só pelo cronograma).
- **Testes** — +13 unit (`tests/unit/schedule-msproject.test.ts` com
  fixtures) e +19 integração (`tests/integration/schedule-import.test.ts`):
  replace-all, ancoragem do início, WBS religado, audit/domain events,
  calendário no import, dependência/ciclo/id duplicado rejeitados sem
  tocar no banco, aplicar calendário (fim adiado + datas persistidas +
  default do projeto), XML e isolamento de tenant nos templates.
- **Gate** ✅: lint · typecheck · **99 unit** · **118 integração** · build
  **69 rotas** (51 endpoints; +4) · 6 migrations · smoke autenticado:
  `/painel`/`/cronograma`/`/templates` 200, `GET schedule-templates` 200,
  `POST schedule/import` 200 → 66/74/11/10 com replace-all (e o cronograma
  do projeto demo restaurado com o template de cozinha industrial).

### Próximo passo (definido nesta sessão)

**E08 Cost/EVM** — orçamento, commitments, actuals (Fase 4; base do custo que
o gate G4 exige). Depois: E09 Documents.

---

## 14/10/2026 — Calculadora de orçamento de cozinha industrial (alimenta E08)

Feature pedida pelo usuário como aplicação dentro do MICI: calcula o
orçamento de implantação de cozinha industrial a partir de
`memoria_calculo.txt` (§1 premissas, §2 capacidade, §3.1 ambientes, §4
equipamentos, §5 infraestrutura, §6/§7 custos). Sem persistência: a saída é
**arquivo exportável (JSON + CSV)** — a entrada da fase de orçamentação
(E08 Cost/EVM).

- **Escopo definido com o usuário**: rota própria `/orcamento` dentro do
  MICI; pipeline completo (premissas → dimensionamento → quantitativos →
  custos grupos 1–15 → indiretos/reserva/BDI → memória de cálculo); tabela
  de preços editável com defaults ilustrativos (fonte + data-base por PU,
  substituir por SINAPI/cotação); exportação como único output; entrada via
  assistente guiado (wizard); item próprio na sidebar.
- **Módulo puro** `src/modules/budget/` (sem I/O):
  - `schemas.ts` — zod de entrada (`premissas`, `cardapio`, `equipamentos`,
    `ambientes`, `usosAgua`, `tabelaPrecos`); premissas com defaults
    (2.000 ref/dia, janela de pico 2 h, 4 h produção, indiretos 10%,
    contingência 10%, BDI 20%, data-base `2026-10`).
  - `defaults.ts` — `FATORES` explícitos e exportados (simultaneidade
    elétrica 0,7 / gás 0,6; exaustão 40 m³/h·m²; carga térmica 180/220 W/m²;
    parede/piso 1,6; 25% área úmida; fator demolição por intervenção;
    estoque refrigerados 2 dias × 1,3 L/kg; utensílios 0,15/reação; esgoto
    0,9 × água…), `GRUPOS_ORCAMENTO` 1–15, catálogo default (cardápio 6
    preparações, 13 equipamentos, 8 ambientes = 300 m², 5 usos de água, PU
    ilustrativo por código com fonte/data-base).
  - `engine.ts` — `estimateKitchenBudget(input)`: Qh = capacidade ÷ janela
    (ou 8 h se escalonada); massa pronta/comprada por preparação; por
    família, dimensiona equipamentos (cocção/preparo pela demanda kg/h ÷
    capacidade-hora com ciclo; lavagem por refeições/hora × 0,15;
    refrigeração por volume L; exaustão por área de coifa; transporte e
    bancada por índice), potência/demanda/gás/carga térmica/exaustão/
    água-esgoto; ~30 linhas de quantitativo com `origem`
    (DIMENSIONAMENTO/INDICE_PRELIMINAR/CADASTRO) e fonte do preço;
    consolidação direto → indiretos → base → reserva → BDI → total e
    custo/refeição; avisos (PU ilustrativo, sem preço, área não informada,
    área do programa > disponível, gás incoerente…).
  - `export.ts` — `buildBudgetJson` (com `schemaVersion`), `buildBudgetCsv`
    (separador `;`, decimal vírgula, aspas escapadas; seções premissas/
    dimensionamento/quantitativos/consolidação/avisos), `budgetFileName`.
- **API** `POST /api/v1/budget/estimate` (`COST:CREATE` + zod; estado puro,
  sem escrita em banco) devolve `{ estimate }`.
- **Tela** `/orcamento` (guarda `COST:VIEW`): assistente de 6 passos —
  Premissas, Cardápio, Equipamentos, Ambientes e utilidades, Preços,
  Resultado (totais, avisos, memória de cálculo) com download JSON/CSV via
  `apiRequest`.
- **Sidebar** — item "Orçamento de cozinha" (ChefHat) no grupo Portfólio,
  antes de "Custos" (que continua `soon` até o E08).
- **Correções encontradas pelos testes**: default de `premissas` no zod
  (`.default(() => parse({}))`); cálculo de água com divisão dupla ÷1000
  (virava 0,02 m³); PU dos equipamentos agora vem do cadastro
  (`custoUnitarioTotal` já com frete/instalação) em vez de tabela, que não
  tem códigos `G9-EQ-*`.
- **Testes** — +16 unit (`tests/unit/budget-engine.test.ts`: Qh, turno
  escalonado, massa, exemplo da memória 300 kg/3 h → 2 caldeirões,
  refrigeração por volume, potência/gás/exaustão, água/esgoto, cadeia de
  consolidação, rastreabilidade dos quantitativos, avisos, validações) e
  +8 unit (`tests/unit/budget-export.test.ts`: JSON válido, seções do CSV,
  pt-BR, escape de aspas, nome do arquivo).
- **Gate** ✅: lint · typecheck · **120 unit** · build **70 rotas** (+2:
  `/orcamento` e `/api/v1/budget/estimate`). Integração não reexecutada
  nesta sessão (requer Postgres; módulo é stateless e sem migration).

### Próximo passo (definido nesta sessão)

**E08 Cost/EVM** — o `estimate` deste módulo é a base de custo estimado;
seguem commitments, actuals, EVM e o gate G4. Depois: E09 Documents.

---

## 14/10/2026 (tarde) — Produção: login, sync de dados e AUTH_URL

Após o deploy da manhã (E07 + orçamento), o usuário reportou que **não
conseguia logar no Vercel** e que **funcionalidades não apareciam em
produção**. Diagnóstico e correção:

### Login falhava (`CredentialsSignin`)

- Logs do Vercel: `POST /api/auth/callback/credentials` →
  `CredentialsSignin` + **302 para `http://localhost:3000`**.
- **Senhas**: `admin@mici.demo` tinha hash próprio (`scrypt$f89c2…`,
  trocado pós-seed), mas `gerente/pmo/viewer/qualidade` dividiam um hash
  antigo que não batia com `Demo@1234` → `scripts/reset-profile-passwords.ts`
  redefiniu os 4 no Neon (admin intocado). Login do gerente verificado
  ponta a ponta (sessão + `/painel` 200).
- **`AUTH_URL`**: ausente no Vercel; o Auth.js v5 sem ela deriva a URL base
  do request e, atrás do proxy do Vercel, usava o default `localhost:3000`.
  Adicionada `AUTH_URL=https://mici-theta.vercel.app` (Production,
  `vercel env add`) + redeploy.

### Código ok, dados desalinhados

- Análise de ambiente: deploy de 10:26 saía da mesma árvore (todas as
  páginas/APIs 200 em produção) — **código sincronizado**. Mas o Neon
  estava com 0 requisitos, 0 WBS, 0 atividades (vs. 3/5/66 no local): as
  telas novas abriam vazias e pareciam "funcionalidades ausentes".
- **Sync Neon ← local** com `pg_dump`/`pg_restore` **18.6** (Neon roda PG
  18.6; baixados os binários EDB para `%TEMP%\mici-sync\pg18` — o pg_dump 17
  local recusa server mais novo). Sequência:
  1. `preserve-admin-hash.ts save` (guarda o hash que o usuário conhece);
  2. backup do Neon (`neon-backup.dump`, 162 KB);
  3. dump do local (`local.dump` — removido `?schema=` da URL, que o
     pg_dump rejeita);
  4. `pg_restore --clean --if-exists --no-owner --no-privileges`;
  5. `preserve-admin-hash.ts restore`.
- **Paridade confirmada**: mesmos UUIDs (org, 6 usuários incl.
  `novo.mici`, 2 projetos), 3 requisitos, 5 nós WBS, 66 atividades
  (EXAURA-001), 112 auditorias.

### Correções de build durante o deploy

- `scripts/check-users.ts` usava `prisma.membership` (inexistente; o model
  é `OrganizationMembership`) — o typecheck do `vercel deploy` falhou;
  corrigido e redeploy OK.

### Verificação final (produção)

- Login gerente → **302 `https://mici-theta.vercel.app/painel`** (sem mais
  localhost) → `/painel` 200, `/orcamento` 200.
- `/projetos/[id]/{requisitos,wbs,cronograma}` 200 com dados; API do
  EXAURA-001 devolve 66 atividades; WBS do DEMO-001 com raiz + 2 filhos;
  REQ-001 visível.
- Utilitários de diagnóstico criados na sessão commitados (`9c77e6c`) e
  push para `origin/main`.

### Próximo passo (definido nesta sessão)

**E08 Cost/EVM** — commitments, actuals, EVM e gate G4 (o `estimate` de
`/orcamento` é o custo estimado de entrada). Depois: E09 Documents.

---

## 14/10/2026 (noite) — E08 Cost/EVM concluído

Fechado o épico de custos previsto desde a calculadora de orçamento: itens
do orçamento, compromissos, realizados, EVM e o gate G4 que exige baseline
de custo aprovada.

### Persistência

- Migration `phase6_cost` (`prisma/migrations/20261014231808_phase6_cost/`)
  aplicada: `CostItem`, `CostCommitment`, `CostActual` e enum
  `CommitmentStatus`; relations em `Project` e `WBSNode`; índices por
  organização/projeto e únicos `[projectId, code]`.
- Códigos automáticos por projeto: `CI001`/`CC001`/`CA001` (incrementais a
  partir do maior existente). `CostItem.amount` derivado
  (quantity × unitPrice) e persistido para agregar.

### Módulo `src/modules/cost/`

- `schemas.ts` (zod), `engine.ts` (EVM puro), `selectors.ts` (leituras
  escopadas por organização + `listCostSummaries`), `items.ts`,
  `commitments.ts`, `actuals.ts`, `import-estimate.ts`, `evm.ts`,
  `baselines.ts`, `gate-checks.ts`.
- Motor EVM: BAC = Σ dos itens; EV = Σ amount × progresso físico médio das
  atividades do nó WBS vinculado; PV = Σ amount × progresso planejado
  (fração temporal das datas até a data de corte); AC = Σ dos actuals. Itens
  sem WBS entram como 0. EAC = BAC/CPI (ou AC+(BAC−EV) se AC>0 sem CPI, ou
  BAC sem AC); SPI nulo só quando PV = 0.

### API (`src/app/api/v1/projects/[id]/cost/`)

Itens (`route.ts` + `[itemId]`), compromissos (`commitments/` +
`[commitmentId]`), realizados (`actuals/` + `[actualId]`), baselines
(`baselines/` + `[baselineId]`, POST/DELETE), `evm/`, `import-estimate/` e
`summary/`. Tudo via `apiHandler` + `requireTenantContext` +
`assertPermission("COST", …)`; audit em `prisma.auditEvent` e domain events
(`Cost.ItemCreated`, `Cost.Committed`, `Cost.ActualRecorded`,
`Cost.EstimateImported`).

### Gate G4 e baseline de custo

- `errors.ts`: novo código `COST_BASELINE_REQUIRED` (409).
- `gates/instances.ts`: no `action === "approve"` do G4, checagem via
  `getG4CostApprovalBlocks` — bloqueia só quando o projeto tem itens de
  custo vivos sem baseline `type=COST` APROVADA (projetos sem itens não são
  bloqueados, preservando os testes existentes).
- Baseline reutiliza o model `Snapshot`/`Baseline` com `type=COST` e
  snapshot `{capturedAt, totalBudget, itemCount, items}`; approve
  supersede as anteriores; baseline aprovada é imutável
  (`BASELINE_IMMUTABLE`).

### Integração com `/orcamento`

- `POST /cost/import-estimate` recebe o JSON exportado por `/orcamento`
  (campo `quantitativos`) e faz replace-all dos itens vivos, códigos
  `ORC001…`.

### UI

- `/projetos/[id]/custos` — cards EVM, tabelas de itens/compromissos/
  realizados/baselines, CRUD via dialogs, import de estimate, `load()`
  refetch `/summary` + `router.refresh()`.
- `/custos` — visão portfolio: uma linha por projeto (itens, orçamento,
  comprometido, realizado), link para a tela por projeto.
- `nav-items.ts`: item "Custos" habilitado apontando para `/custos`.

### Testes e gate

- +12 unit (`tests/unit/cost-engine.test.ts`) — BAC/PV/EV/AC, EAC/SPI/SV,
  progresso planejado, itens sem WBS, SPI nulo com PV = 0.
- `tests/integration/cost.test.ts` escrito (CRUD, EVM, import replace-all,
  baseline COST, bloqueio G4, isolamento de tenant) mas **não executado**:
  o harness de integração chama `prisma db push --force-reset` contra
  `mici_test` e o Prisma exige consentimento humano explícito para ação
  destrutiva. Deixado pendente de execução sob consentimento do usuário.
- Gate ✅: lint · typecheck · **132 unit** · build **71 rotas** (+2:
  `/custos` e API de cost) · migration `phase6_cost` aplicada.

### Próximo passo (definido nesta sessão)

**E09 Documents** — módulo de documentos do projeto. Antes, sob
consentimento, rodar `npm run test:integration -- cost` para validar o
teste de integração escrito.

---

## 15/10/2026 — E09 Documents concluído (Fase 4 fechada)

Upload com revisões imutáveis, máquina de estados com aprovação auditada e
links genéricos para qualquer objeto do projeto. Gate completo verde e
suíte de custos finalmente executada sob consentimento.

### Ambiente: Postgres local e Prisma CLI (dois problemas resolvidos)

- **Backends morriam com `0xC0000142` (DLL_INIT_FAILED)** — exclusões do
  Windows Defender (paths `Programs\PostgreSQL17`, `PostgreSQL17-data`,
  processos `postgres.exe`/`psql.exe`, aplicadas via UAC) **não** resolveram:
  a árvore de processos do shell do agent envenena backends iniciados por
  ele. Solução: subir o Postgres pela **Agendador de Tarefas** — tarefa
  `mici-postgres` → `%TEMP%\opencode\start-pg.cmd` (contexto limpo;
  `psql -U mici -P mici` autentica normalmente). Start manual:
  `& "$env:LOCALAPPDATA\Programs\PostgreSQL17\bin\pg_ctl.exe" -D
  "$env:LOCALAPPDATA\PostgreSQL17-data" -l serverN.log start` (recuperação
  ~35–45 s; "sharing violation" no log é normal).
- **Prisma CLI dava `P1001` mesmo com o banco no ar** — o engine Rust não
  conecta em `localhost` (IPv6/`::1`) nesta máquina, mas `pg` do Node e
  `psql` conectam. `.env`, `.env.development.local` e `.env.test` migraram
  `localhost:5432` → `127.0.0.1:5432`; desde então `migrate`/`db push`
  funcionam.

### Migration e schema

- `phase7_documents` (`20261015225202`): enum `DocumentStatus` +
  `Document` (código `DOC001` por projeto, status, data de vigência) +
  `DocumentRevision` (append-only: revisão, hash SHA-256, `content` bytea,
  motivo, aprovação da revisão, `@@unique([documentId, revision])`) +
  `DocumentApproval` + `DocumentLink` (`@@unique` composto anti-duplicidade)
  + relação `Project.documents`. **Pendente no Neon (aplicar antes do
  deploy)**.

### Módulo `src/modules/documents/`

- `engine.ts` (puro): transições `SUBMIT` WIP→FOR_REVIEW ·
  `APPROVE` FOR_REVIEW→APPROVED · `REJECT` FOR_REVIEW→WIP (motivo
  obrigatório, agora também validado no módulo, não só no Zod) ·
  `RELEASE` APPROVED→RELEASED_FOR_EXECUTION · `OBSOLETE` a partir de
  FOR_REVIEW/APPROVED/RELEASED; `canCreateRevision` (BR-009: só
  APPROVED/RELEASED/OBSOLETE), `canEditMetadata` (WIP/FOR_REVIEW),
  `canDeleteDocument` (BR-010: aprovado/liberado nunca somem).
- `storage.ts`: allowlist de MIME (PDF/Office/imagens/texto/CSV/ZIP),
  limite **4 MB** (Postgres bytea — body do Vercel serverless ~4,5 MB),
  SHA-256 do binário. `schemas.ts` (Zod), `selectors.ts` (DTOs com
  `currentRevisionId`), `documents.ts`, `revisions.ts`, `links.ts`,
  `downloads.ts` — commands com `ActorContext` + audit + domain events.
- BR-011: `APPROVE`/`REJECT`/`RELEASE` gravam `AuditEvent` + linha em
  `DocumentApproval`; `RELEASE` emite `Document.Released`.

### API e UI

- `POST|GET /projects/[id]/documents` (upload multipart), `[docId]`
  (GET/PATCH/DELETE), `revisions` (POST nova revisão), `status`
  (transições com permissão por ação: EDIT/APPROVE/REJECT), `links`
  (+ DELETE), `revisions/[revisionId]/download` (audit `DOWNLOAD`) —
  7 endpoints novos, módulo `DOCUMENT` no RBAC.
- `/documentos` (visão global do tenant) e `/projetos/[id]/documentos`
  (CRUD, transições, revisões com histórico, links); item "Documentos"
  na sidebar.

### Testes e gate (15/10)

- `cost.test.ts` executado pela primeira vez (consentimento dado): 24
  testes — **2 bugs reais achados e corrigidos**: (1) teste de código
  `CC001` conflitava com compromisso criado antes (agora código explícito
  `CC-PROT`); (2) `importEstimateAsCostItems` fazia *soft delete* e a
  reimportação violava o índice único `(projectId, code)` — agora
  **hard delete** (`deleteMany`), mesmo padrão do import de schedule, com
  FKs `ON DELETE SET NULL`.
- Gate ✅: lint · typecheck · **142 unit / 12 arquivos** ·
  **162 integração / 10 arquivos** (documents: 21) · build **96 rotas**
  (75 endpoints) · migrations locais 8.

### Próximo passo (definido nesta sessão)

**E10 Risk** — risk register, matriz de probabilidade×impacto, respostas
e risco residual. Antes: aplicar `phase7_documents` no Neon
(`npx prisma migrate deploy` com `DATABASE_URL` do `.env.local`), commit e
deploy via `npx vercel --prod`.

---

## 20/10/2026 — E10 Risk completo

### Verificação de produção (pendência do 15/10)

- Neon com as 8 migrations (`phase7_documents` incluída), git limpo e deploy
  do E09 já vivo (`/api/v1/projects/.../documents` → 401 sem sessão;
  health → 200). Nada a executar; pendência concluída.

### Banco e schema (migration `phase8_risk`)

- Enums `RiskCategory` (10 categorias da spec), `RiskStatus`
  (IDENTIFIED→ANALYZED→PLANNED→TREATING→MONITORING→CLOSED/CANCELLED) e
  `RiskResponseStrategy` (MITIGATE/TRANSFER/AVOID/ACCEPT/ESCALATE).
- Models `Risk` (código `RI001` por projeto, causa/evento/efeito,
  probability/impact 1–5, **exposure derivado** prob×impacto, residuais,
  vínculos WBS/atividade/custo sem FK obrigatória), `RiskResponse`
  (append-only, histórico de planos) e `RiskMatrixConfig` (1 por org).
- `20261020215748_phase8_risk` aplicada localmente (9 no total) **e no
  Neon** (20/10, `prisma migrate deploy` — todas as 9 confirmadas).

### Módulo e API

- `src/modules/risk/`: motor puro (`engine.ts` — exposição, níveis,
  matriz default 4/9/16, máquina de estados com CANCEL/REOPEN/TREAT,
  `availableRiskActions`), `schemas.ts` (zod), `selectors.ts` (linhas com
  nível derivado na leitura + `listRiskSummaries`), `risks.ts` (CRUD +
  transições + respostas, audit + domain events `Risk.Identified` /
  `Risk.Escalated` / `Risk.Closed`), `matrix.ts` (upsert configurável,
  E10-US02).
- Regras de negócio: exposure sempre recalculado antes de persistir; nível
  nunca persistido; CANCEL exige motivo; PLAN exige estratégia+tratamento+
  proprietário (grava `RiskResponse`); CLOSE exige residuais 1–5;
  terminal (CLOSED/CANCELLED) imutável (UPDATE/DELETE bloqueados);
  `RISK_INVALID_STATE` (409) novo em `errors.ts`.
- Endpoints: `GET|POST /projects/[id]/risks`, `GET|PATCH|DELETE
  /risks/[riskId]`, `POST /risks/[riskId]/status`,
  `GET|POST /risks/[riskId]/responses`, `GET|PUT /risk-matrix`
  (PUT exige `RISK:ADMIN`). Módulo `RISK` já existia no RBAC (seed
  idempotente) — nenhuma migração de permissões.

### UI

- `/projetos/[id]/riscos` — registro com cards de resumo, tabela, CRUD,
  transições e histórico de respostas (`risk-view.tsx`).
- `/riscos` — visão global por projeto (abertos, críticos, altos,
  atrasados) + diálogo de configuração da matriz (`matrix-config.tsx`).
- Sidebar: item "Riscos" habilitado (`/riscos`); links Custos/Documentos/
  Riscos adicionados no detalhe do projeto.
- **Bug E08 corrigido**: `cost-view.tsx` chamava `${base}/items` (rota
  inexistente) — agora `${base}` / `${base}/${id}` (3 call sites).

### Testes e gate (20/10)

- `tests/unit/risk-engine.test.ts` (13 testes) e
  `tests/integration/risk.test.ts` (22 testes): CRUD, RI001, exposure
  derivado, ciclo completo + residuais, CANCEL/PLAN obrigatórios,
  terminal imutável, histórico de respostas, matriz configurável muda
  níveis, resumos, escalada CRITICAL, isolamento de tenant.
- `tests/integration/global-setup.ts`: suporta `MICI_TEST_NO_RESET=1`
  (pula o `--force-reset` e preserva dados do `mici_test`; exigido pelo
  Prisma 7 para agentes — integração rodou sem apagar dados anteriores).
- Gate ✅: lint · typecheck · **154 unit / 13 arquivos** ·
  **184 integração / 11 arquivos** · build **102 rotas** (81 endpoints) ·
  migrations locais 9.

### Deploy (20/10)

- Commit `a070e54` em `main` (25 arquivos, +4062 linhas) e push.
- Migration `phase8_risk` aplicada no Neon; deploy `npx vercel --prod`
  concluído — `mici-theta.vercel.app` com 102 rotas (rotas de risks e
  risk-matrix no ar).
- Smoke: `/api/v1/health` → 200; `/api/v1/projects/x/risks` → 401;
  `/api/v1/risk-matrix` → 401 (protegidas, como esperado sem sessão).

### Próximo passo

- **E11 Change** — request, impacto, aprovação, baseline revision,
  implementation.

## 21/10/2026 — Incidente: upload falhava direto do OneDrive

### Relato

- Usuário relatou "Falha de conexão com o servidor" ao enviar documento em
  produção (`mici-theta.vercel.app`), repetidamente.

### Diagnóstico (evidências)

- API saudável em todas as variações testadas via CLI na mesma máquina:
  uploads de 0.1–4 MB, HTTP/1.1 e HTTP/2, upload lento (70 s a 60 KB/s) —
  todos 201; 4.1 MB → 422 de validação; 4.4 MB → 413 da borda Vercel.
- Logs Vercel: nenhum POST `/documents` do usuário chegava à function.
- Instrumentação no cliente (XHR com progresso) revelou o diagnóstico
  decisivo: **arquivo de 15 KB, "nenhum byte enviado", servidor OK** na
  sonda posterior — a falha era na **leitura do arquivo no navegador**,
  antes de qualquer requisição.
- Causa raiz confirmada pelo usuário: **upload direto de arquivo do
  OneDrive em modo online (nuvem)** — o browser falha ao hidratar/ler o
  placeholder (ERR_UPLOAD_FILE_CHANGED) e o XHR morre com 0 bytes.

### Correções aplicadas

- `api-client.ts` (commit `6401472`): `Content-Type` não é mais forçado a
  JSON em `FormData`; erro de rede vira `ApiError` `NETWORK_ERROR`.
- `api-client.ts` (commit `66c628e`): `console.error` com causa real do
  fetch rejeitado.
- `api-client.ts` + `document-view.tsx` (commit `e245549`): upload via
  **XHR** com progresso no botão, erro renderizado **dentro** do diálogo
  (antes ficava atrás do overlay) e sonda `/api/v1/health` após falha
  para separar "rede fora" de "envio interrompido".
- Mensagem de "nenhum byte enviado" agora orienta a copiar o arquivo do
  OneDrive para o computador antes de enviar.

### Encerramento (21/10)

- Gate ✅ após correções: lint · typecheck · 154 unit · 184 integração
  (com `MICI_TEST_NO_RESET=1`) · build.
- Commits em `main` e deploys Vercel: `66c628e` (console.error), `e245549`
  (XHR + progresso + erro no diálogo + sonda), `ed299f5` (orientação
  OneDrive + este registro). Produção em `mici-theta.vercel.app`.
- Dados de teste removidos do Neon (documents LT-*, usuário de teste
  `upload.test@mici.demo` — se recriar para diagnóstico, remover depois).
- Status salvo no ROADMAP (seção 21/10). Retomada: **E11 Change**.

### Lição

- "Falha de conexão" no fetch não é sempre rede: 0 bytes enviados +
  servidor respondendo = o arquivo não pôde ser lido do disco (OneDrive
  online-only, arquivo sincronizando ou bloqueado). Workaround: copiar o
  arquivo localmente e enviar a cópia.

---

## 21/10/2026 — Fase 4: Épico E11 Change (controle de mudanças)

### Escopo implementado (spec §31)

- **Modelo** (`prisma/schema.prisma`, migration `phase9_change`):
  `ChangeRequest` (código `CR001` automático por projeto, `costDelta`
  Decimal, `scheduleDays`), `ChangeImpact` (dimensão + severidade,
  upsert única por mudança+dimensão), `ChangeApproval` (append-only) e
  `Baseline.changeRequestId` nullable para rastreabilidade BR-005.
  Enums: `ChangeStatus` (DRAFT→…→CLOSED + CANCELLED),
  `ChangeCategory`, `ImpactDimension` (11 domínios da spec: escopo,
  custo, prazo, qualidade, riscos, contratos, documentos, operação,
  regulatório, ambiental, sustentabilidade), `ImpactSeverity`,
  `ChangeApprovalAction` (APPROVE/REJECT).
- **Domain** (`src/modules/change/`): máquina de estados pura
  (`engine.ts`) — `CANCEL/REJECT/VERIFY` exigem `reason`;
  `IMPLEMENT` exige `implementationNotes` e aceita `baselineIds`
  (valida pertencência ao projeto); `REQUEST_APPROVAL` exige ≥1
  impacto; edição só em DRAFT/IMPACT_ANALYSIS; exclusão lógica só em
  DRAFT/CANCELLED/REJECTED. Erro novo `CHANGE_INVALID_STATE` (409).
  Permissões do módulo `CHANGE` (já no catálogo seed) por ação:
  APPROVE/REJECT exigem `CHANGE:APPROVE`/`CHANGE:REJECT`, demais
  `CHANGE:EDIT`. Domain events: `Change.Requested/Approved/Rejected/
  Implemented/Closed`.
- **API** (`/api/v1/projects/[id]/changes`): coleção GET/POST, item
  GET/PATCH/DELETE, `/status`, `/impacts` (upsert) e `/approvals`.
- **UI**: `/mudancas` (portfólio) e `/projetos/[id]/mudancas`
  (`change-view.tsx`: lista, criação, painel de detalhe com impacts e
  approvals, transições conforme permissão); item "Mudanças" na nav.

### Verificação

- Gate ✅: lint · typecheck · 169 unit (+15 em `tests/unit/
  change-engine.test.ts`) · 200 integração (+16 em
  `tests/integration/change.test.ts`) · build (108 rotas).
- Smoke autenticado via HTTP contra dev server (login Auth.js por
  `/api/auth/csrf` + callback): criação CR001 e ciclo completo
  SUBMIT→START_ANALYSIS→(impact HIGH)→REQUEST_APPROVAL→APPROVE→
  IMPLEMENT→VERIFY→CLOSE, detalhe com severity=HIGH/impacts=1/
  approvals=1, aprovação registrada por "Alice Admin"; dados de smoke
  removidos do banco dev.
- Nota: testes de integração rodaram com `MICI_TEST_NO_RESET=1`
  (sem `--force-reset` no `mici_test`).
- Status salvo no ROADMAP (seção 21/10). Retomada: **E12 Field**.

## 21/10/2026 (noite) — E12 Field, Fatia 1

### Escopo decidido

- E12 fatiado em 2 fatias (decisão do usuário): **Fatia 1** = `FieldDiary`,
  `FieldTask`, `Constraint` + `PhotoEvidence` (entidade própria com
  `diaryId` opcional — decisão do usuário: não embutir a foto no diário);
  **Fatia 2** = `ProgressMeasurement` (BR-006: percentual financeiro não
  define avanço físico), home de campo mobile/PWA (offline com UUID
  idempotente) e fotos ligadas a atividade/WBS/inspeção.
- Spec: §38 (mobile-first), §26 (campos do diário), §12 (entidades) e
  §39 (Constraint Identification → Constraint Removal).

### Entrega

- **Schema** (`phase10_field`, 12ª migration, aplicada localmente): enums
  `FieldDiaryStatus` (DRAFT/SUBMITTED/APPROVED/REJECTED/CANCELLED),
  `FieldTaskStatus`, `FieldPriority`, `ConstraintStatus`,
  `ConstraintType` (8); models `FieldDiary` (únicos `projectId+code` e
  `projectId+entryDate` — um diário por dia de obra), `FieldTask`,
  `Constraint`, `PhotoEvidence` (content bytea + hash/MIME/sizeBytes);
  relações reversas em `Project`/`WBSNode`/`ScheduleActivity`.
- **Domain** (`src/modules/field/`): `engine.ts` (máquinas puras + labels
  PT + `summarizeFieldBoard` Hoje/Esta semana/Atrasadas/Restrições),
  `schemas.ts` (zod), escrita (`diaries/tasks/constraints/photos.ts` com
  audit + domain events), `selectors.ts` (leitura com escopo org +
  `listFieldSummaries`), `common.ts` (`ActorContext`, `nextFieldCode`
  FD/FT/CN/PH001, `assertFieldLinks`), `http.ts` (helpers das rotas).
  Erro novo `FIELD_INVALID_STATE` (409).
- **Permissões** (módulo `FIELD` já no catálogo seed): `SITE_COORDINATOR`
  = VIEW/CREATE/EDIT (não aprova o próprio diário); `PROJECT_MANAGER` =
  7 sem ADMIN. Transição do diário exige `FIELD:APPROVE`/`FIELD:REJECT`.
- **API** (12 rotas): `/field/diaries` (+`[id]`, `+[id]/status`),
  `/field/tasks`, `/field/constraints`, `/field/photos` (multipart com
  allowlist de imagem) e `/field/summary`.
- **UI**: `/campo` (quadro da organização por projeto) e
  `/projetos/[id]/campo` (`field-view.tsx`: 4 abas — Diários, Tarefas,
  Restrições, Fotos — resumo do dia, transições conforme permissão);
  item "Campo" (`HardHat`) na nav.

### Verificação

- Gate ✅: lint · typecheck · **190 unit / 15 arquivos** (+21 em
  `tests/unit/field-engine.test.ts`) · **221 integração / 13 arquivos**
  (+17 em `tests/integration/field.test.ts`: unicidade de data, workflow,
  imutabilidade terminal, restrição com resolução, allowlist de foto,
  isolamento de tenant) · build **121 rotas** (91 endpoints + 30 páginas).
- Nota: testes de integração rodaram com `MICI_TEST_NO_RESET=1`.
- **Deploy (21/10)**: commit `4846fa4` (32 arquivos, +5323) em `main` e
  push; `prisma migrate deploy` aplicou `phase10_field` no Neon (12ª de
  12); `vercel deploy --prod` → `mici-nvj22o9vy` pronto. Smoke
  autenticado (login Auth.js, `admin@mici.demo`): `/api/v1/projects`
  → DEMO-001, `/field/summary` → 200 com board zerado, página
  `/projetos/[id]/campo` → 200 (33 KB); `/api/v1/health` → 200; rota
  de campo sem sessão → 401 UNAUTHENTICATED.
- Registro do deploy commitado à parte (docs).
- Retomada: **E12 Fatia 2**.

## 22/10/2026 — E12 Field, Fatia 2

### Escopo (decisão acordada)

- **Fatia 2 do E12**: `ProgressMeasurement` (BR-006 + critério de sucesso
  6 "avanço físico possuir critério"), idempotência offline com UUID
  (`clientUuid`, §38 "toda operação offline deve possuir UUID
  idempotente") nas entidades da Fatia 1 e na medição, fotos ligadas a
  WBS/atividade e aba "Avanço" na UI. Fila offline/PWA completa e
  inspeções/punch list continuam fora (E13).
- Spec: §12 "Controle físico" (níveis Marco/Pacote/Atividade, preferir
  quantidade física real), BR-006 (percentual financeiro nunca define
  avanço físico), E12-US04 (Progress), E12-US06 (mobile).

### Entrega

- **Schema** (`phase11_progress`, **13ª migration** — `prisma migrate dev`
  não roda não-interativo; gerada com `prisma migrate diff --from-migrations`
  usando banco shadow `mici_shadow` (`SHADOW_DATABASE_URL` no `.env` e
  `shadowDatabaseUrl` no `prisma7.config.ts`), escrita em UTF-8 sem BOM e
  aplicada localmente): enum `ProgressLevel` (PROJECT/WBS/ACTIVITY), model
  `ProgressMeasurement` (code PM001, `measurementDate`, `level` derivado,
  `method` (enum `ProgressMethod` já existente), `progressPercent`,
  `quantityPlanned/quantityReal/unit`, `criterion` NOT NULL, notes;
  únicos `[projectId, code]` e `[projectId, clientUuid]`; relações em
  `Project`/`WBSNode`/`ScheduleActivity`); `clientUuid uuid` + único
  `[projectId, clientUuid]` em FieldDiary/FieldTask/Constraint/PhotoEvidence.
- **Domain**: `engine.ts` (`progressLevelFor` Atividade>WBS>Projeto,
  `isValidMeasurement`, `appliedActivityProgress` COMPLETED→100, labels
  PT); `progress.ts` novo — create/update/delete com idempotência por
  `clientUuid`, validação BR-006 dentro do módulo (`assertMeasurement`,
  inclusive no PATCH combinando com o valor existente) e
  `syncActivityProgress` reaproveitando `updateActivityProgress`
  (audit PROGRESS + recálculo de forecast); idempotência por `clientUuid`
  adicionada a diário/tarefa/restrição/foto (`findByIdempotentKey` em
  `common.ts`); seletores `listProgress`/`getProgressRow` e
  `physicalAverage`/`measurementCount` no resumo de campo.
- **API** (+2 = 14 em `field/*`): `/field/progress` (GET com filtro
  `?activityId`/`?wbsNodeId`, POST) e `/field/progress/[progressId]`
  (GET/PATCH/DELETE), RBAC `FIELD`.
- **UI** (`field-view.tsx`): 5ª aba "Avanço" (tabela com nível, vínculo,
  método, avanço, quantidade real, critério + criação/edição com data,
  método, %, quantidades, unidade, critério* e selects WBS/atividade);
  célula "Avanço físico" no resumo do projeto e na home `/campo`;
  selects de WBS/atividade no diálogo de foto; `crypto.randomUUID()` como
  `clientUuid` em todos os creates (diário/tarefa/restrição/foto/medição).

### Verificação (gate ✅)

- lint · typecheck · **193 unit / 15 arquivos** (+3 em
  `tests/unit/field-engine.test.ts`: derivação de nível, critério
  obrigatório, COMPLETED força 100) · **228 integração / 13 arquivos**
  (+7 em `tests/integration/field.test.ts`: PM001 + sincronização do
  `physicalProgress`, critério vazio/percentual fora da faixa barrados,
  edição reaplica e exclusão não retroage, **custo registrado não altera
  avanço (BR-006)**, idempotência `clientUuid` (medição/diário/tarefa),
  isolamento de tenant, código PM001 por projeto) · build **122 rotas**
  (94 endpoints + 28 páginas).
- **Nota de ambiente**: os únicos `unique` novos fizeram o
  `prisma db push` dos testes exigir `--accept-data-loss`; o **Prisma 7
  bloqueia comandos destrutivos feitos por IA** e pediu consentimento
  explícito — usuário autorizou o reset do banco dedicado `mici_test`
  (fluxo padrão do `global-setup`), via
  `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`.
- **Deploy (22/10)**: commit `722bfb4` (21 arquivos, +1601) em `main` e
  push; `prisma migrate deploy` aplicou `phase11_progress` no Neon (13ª
  de 13); `vercel deploy --prod` → `mici-8hqvx6ulb` pronto. Smoke
  autenticado (login Auth.js, `admin@mici.demo`): `/api/v1/projects` →
  DEMO-001, `/field/summary` → 200, **`/field/progress` → 200
  `{"progress":[]}`** (rota nova), página `/projetos/[id]/campo` → 200
  (34 KB), home `/campo` → 200 com célula "Avanço 0%", `/api/v1/health`
  → 200; rota de progresso sem sessão → 401 UNAUTHENTICATED.
- **E12 fechado** (as duas fatias em produção). Fora do arco entregue:
  PWA/fila offline completa (só a idempotência server-side entrou) e
  inspeções/punch list (E13).
- **Estado no fim do dia**: working tree limpa — tudo commitado
  (`722bfb4` feat + `cbe868b` docs), pushado, `phase11_progress` no Neon
  e smoke verde. Nada pela metade.
- **Retomada (23/10)**: iniciar **E13 Quality** (checklist, inspeção,
  NCR, ação corretiva, punch list — espelha o padrão de fatiado do E12:
  schema+domain, API, telas, gate, deploy). Backlog do E12 quando
  houver demanda: PWA/fila offline completa (service worker + fila
  local, aproveitando o `clientUuid` já no lugar).

## 24/10/2026 — E13 Quality, Fatia 1 (checklist + inspeção)

**E13 fatiado em 2 fatias (decisão do usuário)**: **Fatia 1** =
`ChecklistTemplate`/`ChecklistExecution` + `Inspection` (E13-US01/US02);
**Fatia 2** = `NonConformity` (NCR) + `CorrectiveAction` + punch list
(E13-US03/US04/US05, §34). Deploy completo por fatia (gate → commit →
Neon → Vercel → smoke).

### Schema e migration

- `prisma/schema.prisma`: enums `checklist_execution_status`
  (DRAFT/COMPLETED/CANCELLED) e `inspection_status`
  (PLANNED/EXECUTED/PASSED/FAILED/CLOSED/CANCELLED); tabelas
  `checklist_templates` (`items Json`, `@@unique (projectId, code)`),
  `checklist_executions` (snapshot `templateCode/templateName/items` com
  resultado, `inspectionId`, `clientUuid` idempotente) e `inspections`
  (`criterion` NOT NULL, `inspectionDate`, vínculos WBS/atividade);
  `photo_evidence.inspection_id` + reverse relations em `Project`,
  `WBSNode` e `ScheduleActivity`.
- Migration `20261024120000_phase12_quality` (14ª) gerada com
  `prisma migrate diff --from-migrations prisma/migrations --to-schema
  prisma/schema.prisma --script` — **Prisma 7**: `--to-schema` substituiu
  `--to-schema-datamodel` e o shadow database vem do `prisma7.config.ts`
  (sem `--shadow-database-url`); escrita em UTF-8 sem BOM. Aplicada local
  e no Neon.
- RBAC: módulo `QUALITY` (e `QUALITY:DELETE` para ADMIN/PMO) já existiam
  no catálogo (`allPermissionCodes`) → **nenhuma migration de permissão**.

### Domínio (`src/modules/quality/`)

- `engine.ts` (puro): transições da inspeção e da execução, rótulos PT,
  `summarizeChecklistItems` (concluído = todo **obrigatório** respondido),
  `inspectionHasEvidence` (foto ≥ 1 **ou** checklist concluído ≥ 1) e
  `summarizeQualityBoard`.
- `common.ts` reutiliza `audit`/`emitDomainEvent`/`assertCodeFree`/
  `findByIdempotentKey`/`assertMember`/`assertFieldLinks` do módulo de
  campo e acrescenta `nextQualityCode` (CT/CE/IN) e `assertQualityProject`.
- Regras gravadas nos writers: snapshot de itens congelado na criação da
  execução; respostas **só em DRAFT**; `COMPLETE` exige todos os
  obrigatórios respondidos; modelo com execuções não é excluível;
  execução `COMPLETED` não é excluível (reabra → cancele); inspeção só
  edita em PLANNED/EXECUTED; sair de `EXECUTED` (PASS/FAIL) exige
  **evidência adequada** (§33); `FAIL` exige `resultNotes` (o NCR vira na
  Fatia 2); `CANCEL` exige motivo; inspeção executada não é excluível.
- Fotos: `inspectionId` aceito no upload (`field/photos` + schema) e
  filtro `?inspectionId=` — é a prova material que sustenta PASS/FAIL.

### API e telas

- 8 rotas em `/api/v1/projects/[id]/quality/*`:
  `checklist-templates`, `checklist-executions`,
  `inspections` (GET/POST + `[id]` GET/PATCH/DELETE + `[id]/status` POST),
  permissões `QUALITY:VIEW/CREATE/EDIT/DELETE`, mesmos padrões de
  `field/*` (`apiHandler`, `actorOf`, `idsFrom`).
- `components/quality/quality-view.tsx`: quadro (Modelos / Execuções
  pendentes / Inspeções abertas / Planejadas / Reprovadas / Encerradas) e
  3 abas — Modelos (editor de itens com obrigatoriedade), Execuções
  (resposta por item com PASS/FAIL/NA + observação, transições) e
  Inspeções (critério, evidências, transições com motivo/não
  conformidade).
- `/qualidade` (resumo por projeto, espelho de `/campo`),
  `/projetos/[id]/qualidade` (server-side com selectors), item
  "Qualidade" na sidebar (ícone `ClipboardCheck`) e link "Qualidade
  (E13)" no cabeçalho do projeto.

### Gate e deploy

- **Gate verde**: `eslint` 0 problemas · `tsc --noEmit` limpo ·
  **208 unit (16 arquivos)** — 15 novos em `tests/unit/quality-engine.test.ts`
  · **249 integração (14 arquivos)** — 21 novos em
  `tests/integration/quality.test.ts` (executados com
  `MICI_TEST_NO_RESET=1`) · `next build` **132 rotas** (102 endpoints +
  30 páginas).
- **Deploy (24/10)**: commit `ddefc21` (30 arquivos) em `main` e push;
  `prisma migrate deploy` aplicou `phase12_quality` no Neon (14ª de 14 —
  primeira tentativa falhou com P1001 transitório, retry OK);
  `vercel --prod` → `mici-ff842b4h4-homeland1` pronto (alias
  `mici-theta.vercel.app`; primeiro upload caiu com `fetch failed`, retry
  OK). Smoke autenticado (`admin@mici.demo`): `/api/v1/health` → 200,
  `/api/v1/projects` → DEMO-001, **3 rotas novas → 200 com listas vazias**
  (`{"inspections":[]}`, `{"templates":[]}`, `{"executions":[]}`),
  páginas `/qualidade` → 200 (35 KB) e `/projetos/[id]/qualidade` → 200
  (34 KB), rota de qualidade sem sessão → 401 UNAUTHENTICATED.
- **E13 Fatia 1 fechada** (checklist e inspeção no ar). Próximo passo:
  **E13 Fatia 2** — NCR, ação corretiva (Verification → Closed) e punch
  list (§34); em `FAILED`, o `CLOSE` passará a exigir o NCR encerrado.
- **Estado no fim do dia**: working tree limpa após o commit de docs,
  pushado, `phase12_quality` no Neon e smoke verde. Nada pela metade.

## 27/10/2026 — E13: evidência de inspeção na UI de campo

**Gap fechado**: a tela de campo não expunha `inspectionId` no upload/edição
de foto — a evidência era vinculada só via API e o PASS/FAIL da inspeção
falhava com "Registrar o resultado exige evidência" mesmo com foto enviada.

### Mudanças

- `field/schemas.ts`: `updatePhotoSchema` aceita `inspectionId` (uuid nullable).
- `field/photos.ts`: `updatePhoto` valida e grava `inspectionId`
  (`assertInspection` — mesma regra do upload) e audita o vínculo
  (oldValue/newValue).
- `field/selectors.ts`: `PhotoRow` expõe `inspectionCode`; include de
  `inspection` em `photoInclude`.
- `campo/page.tsx`: busca inspeções via `listInspections` e passa opções
  (todas — inclusive encerradas/canceladas, para editar vínculos já gravados).
- `field-view.tsx`: select "Vincular à inspeção (evidência §33)" no diálogo
  de foto (novo e edição), envio no multipart/PATCH, exibição `Insp. CXxxx`
  nos cards e no visualizador de tela cheia.
- `tests/integration/field.test.ts`: teste de edição de vínculo de inspeção
  (vincular → listagem com filtro → desvincular → sai do filtro).

### Gate e deploy

- Gate verde: `eslint` 0 · `tsc --noEmit` limpo · **208 unit** (16 arquivos).
- Testes de integração não rodaram localmente (Postgres/Docker parados).
- **Deploy (27/10)**: commit `6fcb832` em `main` + push; `vercel --prod` →
  `mici-7h2a4kw6n-homeland1` (alias `mici-theta.vercel.app`; o commit
  `1c7c397` da UI de foto já tinha ido ao ar mais cedo). Smoke autenticado
  (`admin@mici.demo` / `Demo@1234`): `/api/v1/health` → 200,
  `/api/v1/projects` → DEMO-001, `/projetos/[id]/campo` → 200 (34 KB — o
  server component rodou `listInspections` sem erro) e
  `/projetos/[id]/qualidade` → 200. O select de inspeção vive dentro do
  diálogo de foto (`Dialog` monta só quando aberto) — verificado por
  typecheck + página 200, não aparece no HTML inicial.
- **Estado no fim do dia**: evidência de inspeção agora é vinculável pela UI
  (campo → foto → inspeção); PASS/FAIL sustentado por foto ou checklist
  concluído, conforme §33.

## 27/10/2026 — E13 Quality, Fatia 2a (NCR + ação corretiva)

**Fatia 2 fatiada de novo (decisão do usuário)**: **2a** = `NonConformity`
(NCR) + `CorrectiveAction` (E13-US03/US04, §33), com **NCR automático quando a
inspeção reprova (FAIL)**; **2b** = punch list (E13-US05, §34).

### Schema e migration

- `prisma/schema.prisma`: enums `non_conformity_status`
  (OPEN/CORRECTION/VERIFICATION/CLOSED/CANCELLED) e
  `corrective_action_status` (OPEN/IN_PROGRESS/DONE/VERIFIED/CLOSED/CANCELLED);
  modelos `NonConformity` (NCxxx, `@@unique([projectId, code])`,
  `clientUuid` idempotente, `inspectionId` com `SET NULL`) e
  `CorrectiveAction` (CAxxx, `nonConformityId` em cascata, `responsibleId`,
  `dueDate`); reverse relations em `Project` e `Inspection`.
- Migration `20261027180000_phase13_ncr_corrective` (105 linhas) gerada com
  `prisma migrate diff --from-migrations --to-schema` (Prisma 7), aplicada
  localmente e client regenerado (7.10.0 em `src/generated/prisma`).

### Domínio (`src/modules/quality/`)

- `engine.ts`: máquinas NCR (`OPEN →(START) CORRECTION →(SUBMIT) VERIFICATION
  →(VERIFY) CLOSED`, `REJECT`/`CANCEL`/`REOPEN`) e ação corretiva
  (`OPEN →(START) IN_PROGRESS →(COMPLETE) DONE →(VERIFY) VERIFIED →(CLOSE)
  CLOSED`, `REJECT` volta a IN_PROGRESS), rótulos PT, helpers
  (`isNonConformityEditable/Open/Resolved`,
  `isCorrectiveActionEditable/Open`) e quadro estendido
  (`nonConformities[Open]`, `correctiveActions[Open]`).
- `common.ts`: `nextQualityCode` aceita `NC` e `CA`.
- `nonconformities.ts` e `corrective-actions.ts` (novos): CRUD + transições
  com notas obrigatórias (`SUBMIT` exige `correctionNotes`, `VERIFY` NCR
  exige `verificationNotes`, `COMPLETE` exige `actionNotes`, `VERIFY` CA
  exige `verificationNotes`, `CANCEL` exige motivo), idempotência
  `clientUuid`, exclusão lógica só nos status editáveis, audit + eventos.
- `inspections.ts`: **FAIL cria NCR automático**
  (`createNonConformityFromInspection` — título "Não conformidade — {título}",
  descrição = `resultNotes`, evento com `auto: true`) e **CLOSE em FAILED
  gateado**: se houver NCR vinculado fora de CLOSED/CANCELLED → `CONFLICT`
  ("Encerrar inspeção reprovada exige a não conformidade encerrada…").
- `schemas.ts`/`selectors.ts`: schemas zod de NCR/CA e rows
  `NonConformityRow`/`CorrectiveActionRow` (com nomes de responsável
  resolvidos), `listNonConformities`/`listCorrectiveActions` com filtros e
  board por projeto estendido.

### API e telas

- **10 rotas novas** em `/api/v1/projects/[id]/quality/*`:
  `non-conformities` e `corrective-actions` (GET/POST + `[id]`
  GET/PATCH/DELETE + `[id]/status` POST), permissões `QUALITY:*`, mesmo
  padrão das demais (`apiHandler`, `actorOf`, `idsFrom`).
- `quality-view.tsx`: **5 abas** (novas "Não conformidades" e "Ações
  corretivas" com tabelas, CRUD e transições), quadro com "NCR abertas" e
  "Ações corretivas abertas", diálogo de transição generalizado (nota
  obrigatória dinâmica por ação) e diálogos de NCR (título/descrição/inspeção
  de origem) e de ação corretiva (NCR, título, descrição, responsável, prazo);
  `qualidade/page.tsx` busca as duas listas e alimenta o board.

### Verificação (gate ✅)

- `eslint` 0 · `tsc --noEmit` limpo · **220 unit / 16 arquivos** (+12 em
  `tests/unit/quality-engine.test.ts`: máquinas NCR/CA, tabela completa,
  resolvido/aberto/editável, board com NCR e ações) ·
  **260 integração / 14 arquivos** (+11 em `tests/integration/quality.test.ts`:
  FAIL cria NCR, CLOSE bloqueado e liberado após NCR, notas obrigatórias,
  CANCEL/REOPEN, CA001 + idempotência, NCR de outro projeto/cancelado
  barrados, fluxo completo, filtros e isolamento).
- **Postgres local voltou** via tarefa agendada `mici-postgres`
  (`Start-ScheduledTask`, porta 5432) — integração rodou com o reset padrão
  do `global-setup` no banco dedicado `mici_test` (consentimento explícito
  do usuário via `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`).

### Deploy

- **Deploy (27/10)**: commit `762b55c` (19 arquivos, +2757) em `main` + push;
  `prisma migrate deploy` aplicou `phase13_ncr_corrective` no Neon (15ª de
  15); `vercel --prod` → `mici-7fzp222qm-homeland1` (alias
  `mici-theta.vercel.app`, 51s). Smoke autenticado (`admin@mici.demo` /
  `Demo@1234`): `/api/v1/health` → 200, `/api/v1/projects` → DEMO-001,
  **`/quality/non-conformities` → 200 `{"nonConformities":[]}`** e
  **`/quality/corrective-actions` → 200 `{"correctiveActions":[]}`** (10
  rotas novas), páginas `/projetos/[id]/qualidade` → 200 (35 KB — os
  selectors de NCR/CA rodaram contra o Neon recém-migrado) e `/qualidade`
  → 200, rota sem sessão → 401 UNAUTHENTICATED.
- **E13 Fatia 2a fechada** (NCR + ação corretiva no ar, FAIL gera NCR,
  CLOSE de inspeção reprovada gateado). Próximo passo: **E13 Fatia 2b** —
  punch list (E13-US05, §34).
- **Estado no fim do dia**: working tree só com os docs desta entrada
  (`DIARIO.md` + `qualidade.md`), commitados em seguida; Neon migrado e
  smoke verde. Nada pela metade.

## 29/10/2026 — E13 Quality, Fatia 2b (punch list)

**E13 completo no código**: punch list (E13-US05, §34) implementada de ponta
a ponta — `PunchItem` com os 7 estados da spec, verificação com evidência de
correção e aba própria na UI. Sem deploy nesta entrada (Neon pendente).

### Schema e migration

- `prisma/schema.prisma`: enum `punch_item_status`
  (OPEN/ASSIGNED/IN_PROGRESS/READY_FOR_VERIFICATION/VERIFIED/REJECTED/CLOSED —
  **sem CANCELLED**, fiel à §34; descarte é soft delete) e modelo
  `PunchItem` (PXxxx, `@@unique([projectId, code])`, `clientUuid`
  idempotente, `priority` reutiliza o enum `FieldPriority`,
  `wbsNodeId`/`activityId` opcionais com `SET NULL`, **duas fotos** —
  `photoEvidenceId` "como está" e `correctionEvidenceId` "como ficou" — via
  relations nomeadas `PunchItemPhotoEvidence`/`PunchItemCorrectionEvidence`
  em `PhotoEvidence`, `verificationNotes`, `rejectReason`, `verifiedById`,
  `verifiedAt`, `closedAt`); reverse relations em `Project`, `WBSNode`,
  `ScheduleActivity` e `PhotoEvidence`.
- Migration `20261029120000_phase14_punch` gerada com
  `prisma migrate diff --from-migrations --to-schema` (Prisma 7), aplicada no
  dev (`migrate deploy`, 16ª de 16) e sincronizada no `mici_test`
  (`db push`); client regenerado (7.10.0).
- **Postgres local**: a tarefa agendada `mici-postgres` ficava "Queued" por
  `DisallowStartIfOnBatteries=True` — corrigido com
  `Set-ScheduledTask -Settings (New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries …)`;
  start direto via shell continua morto por `0xC0000142` (árvore de processos
  do agente), como registrado em 15/10.

### Domínio (`src/modules/quality/`)

- `engine.ts`: máquina punch (`OPEN →(ASSIGN) ASSIGNED →(START) IN_PROGRESS
  →(SUBMIT) READY_FOR_VERIFICATION →(VERIFY) VERIFIED →(CLOSE) CLOSED`,
  `REJECT` de READY/VERIFIED → REJECTED →(REOPEN) IN_PROGRESS, CLOSED
  →(REOPEN) VERIFIED), rótulos PT, helpers (`isPunchItemEditable/Open`,
  `isPunchItemOverdue` — vencido = prazo DATE anterior a hoje e ≠ CLOSED) e
  quadro estendido (`punchItems`, `punchItemsOpen`, `punchItemsOverdue`).
- `common.ts`: `nextQualityCode` aceita `PX`.
- `punch-items.ts` (novo): CRUD + transições com as regras da §33/§34 —
  `ASSIGN` exige responsável (membro ativo), `SUBMIT` exige
  `correctionEvidenceId` (foto da correção, validada no projeto), `VERIFY`
  exige `verificationNotes` e grava `verifiedById`+`verifiedAt`, `REJECT`
  exige motivo (`rejectReason`), `REOPEN` de CLOSED limpa `closedAt`;
  idempotência `clientUuid`, exclusão lógica só em OPEN/ASSIGNED/IN_PROGRESS,
  audit + eventos `Quality.PunchItem.*`.
- `schemas.ts`/`selectors.ts`: schemas zod (`createPunchItemSchema`,
  `updatePunchItemSchema`, `punchItemTransitionSchema` com
  `ownerId`/`correctionEvidenceId` no payload da transição) e
  `PunchItemRow`/`listPunchItems`/`getPunchItemRow` (owner/verificador
  resolvidos, `overdue`, ações disponíveis); `listQualitySummaries` passa a
  contar punch items no board.

### API e telas

- **3 rotas novas** em `/api/v1/projects/[id]/quality/punch-items`
  (GET/POST + `[punchItemId]` GET/PATCH/DELETE + `[punchItemId]/status`
  POST), permissões `QUALITY:*`, mesmo padrão das demais.
- `quality-view.tsx`: **6 abas** (nova "Punch list" com tabela localização /
  descrição / prioridade / responsável / prazo vencido em vermelho / status,
  CRUD e transições), quadro com "Punch list abertos" e "Punch list
  vencidos", diálogo de transição estendido (sele de responsável no `ASSIGN`,
  sele de foto da correção no `SUBMIT`, motivo também no `REJECT`) e diálogo
  de criação/edição (localização, descrição, prioridade `FieldPriority`,
  responsável, prazo, foto do problema, WBS, atividade);
  `projetos/[id]/qualidade/page.tsx` carrega `listPunchItems` e `listPhotos`
  (sele de fotos) e alimenta o board.

### Verificação (gate ✅)

- `eslint` 0 · `tsc --noEmit` limpo · **226 unit / 16 arquivos** (+6 em
  `tests/unit/quality-engine.test.ts`: máquina punch completa, ausência de
  CANCELLED, editable/aberto, `isPunchItemOverdue` por dia, board com punch) ·
  **266 integração / 14 arquivos** (+6 em `tests/integration/quality.test.ts`:
  PX001 + idempotência, foto de outro projeto barrada, fluxo completo
  ASSIGN→CLOSE com regras de ASSIGN/SUBMIT/VERIFY, REJECT com motivo e
  retorno a IN_PROGRESS, edição/vencido/filtros/isolamento, resumo do
  portfólio).
- Integração rodou com `MICI_TEST_NO_RESET=1` (schema já sincronizado via
  `db push` — evita o `--force-reset` que exige consentimento).

### Deploy e smoke (29/10, 21h)

- `vercel --prod` a partir de `main` (`01a0966`): deployment
  **`mici-nb8dr9z1l-homeland1`** (alias `mici-theta.vercel.app`), pronto em
  ~1m — a Fatia 2b está em produção junto com o schema Neon migrado.
- Smoke autenticado (`admin@mici.demo` / `Demo@1234`): `/api/v1/health` →
  200, `/api/v1/projects` → DEMO-001,
  **`/quality/punch-items` → 200 `{"punchItems":[]}`** e página
  `/projetos/[id]/qualidade` → 200 (os selectors de punch rodaram contra o
  Neon); rota sem sessão → 401 UNAUTHENTICATED. (Um GET com id não-UUID
  `/projects/1/...` retorna 500 — o Prisma falha no cast; comportamento já
  observado nas demais rotas, fora do escopo desta fatia.)

### Estado

- Deploy completo: commit **`01a0966`** (feat) + **`52dc736`** (docs desta
  entrada) em `main` + push; `20261029120000_phase14_punch` aplicada no
  Neon; produção (`mici-theta.vercel.app`) servindo a punch list com smoke
  verde.
- **E13 fechado de ponta a ponta** (código + banco + produção); próximo
  épico/decisão a cargo do usuário.

## 29/10/2026 (noite) — E12-backlog, Fatia 1 (PWA + fila offline)

**Decisão do usuário na mesma sessão**: criar o `devcurrent.md` como fonte
oficial de retomada (DIARIO/ROADMAP viram só histórico) e atacar o **backlog
do E12 — PWA/fila offline, Fatia 1** (`devcurrent.md` §4.4).

### O que entrou (código local — ainda não commitado)

- **`src/lib/offline-queue.ts`** (novo): fila de criações de campo com
  store `IndexedDbQueueStore` (DB `mici-offline`/`field-queue`, fallback em
  memória); `enqueueCreate` extrai o `clientUuid` do payload (o reenvio é
  idempotente no server); `flushQueueWith` FIFO — sucesso remove, **4xx →
  `failed`** (não reenvia sozinho; usuário descarta), **ApiError status 0 →
  interrompe o flush** (fica pendente), **5xx → pendente com `attempts++`**;
  `flushQueue()` com trava de concorrência; `sendOrQueueCreate` devolve
  `"sent" | "queued"` (offline determinístico via `navigator.onLine`, queda
  de rede via `ApiError(0)`; 4xx relança para a UI). Evento
  `mici:queue-changed` para a UI.
- **PWA**: `src/app/manifest.ts` (rota de metadata do Next 16 →
  `/manifest.webmanifest`, standalone, theme `#2563eb`, ícone SVG);
  `public/icon.svg`; `public/sw.js` (cache-first `/_next/static/`,
  network-first de navegações com fallback, **nunca intercepta `/api/`** nem
  não-GET; cache `mici-shell-v1` + cleanup no activate);
  `src/components/service-worker-register.tsx` (só em produção) montado no
  layout raiz (+ `viewport.themeColor`).
- **UI** (`field-view.tsx`): os 4 creates (diário/tarefa/restrição/medição)
  passam a usar `sendOrQueueCreate` — offline enfileira e mostra "salvo
  offline"; edições PATCH continuam online-only. Banner com contagem de
  pendentes/falhas, **"Sincronizar agora"** e **"Descartar falhas"**;
  flush automático no evento `online`; conectividade via
  `useSyncExternalStore` (sem `setState` síncrono no effect, exigência do
  lint React 19).
- **Testes**: `tests/unit/offline-queue.test.ts` (12 casos: store, enqueue,
  contagens, flush FIFO/4xx/rede/5xx, sent/queued/4xx) e lacuna fechada em
  `tests/integration/field.test.ts` — **restrição era a única das 4 entidades
  sem teste de idempotência com `clientUuid`**.

### Gate (29/10, 23h) — tudo verde

- `npm run lint` ✅ (corrigidos: `set-state-in-effect`, `useSyncExternalStore`
  para conectividade, ordem de declarações) · `npm run typecheck` ✅
- `npm test` ✅ **238 unit / 17 arquivos** (+12) ·
  `MICI_TEST_NO_RESET=1 npm run test:integration` ✅ **266 / 14**
- `npm run build` ✅ — `/manifest.webmanifest` gerado como rota estática.

### Estado

- **Código pronto + gate verde** ao fim do desenvolvimento; na sequência,
  sob pedido do usuário: **commit + push + deploy + smoke** (abaixo).

### Commit e deploy (29/10, 23h)

- Commits: **`116bd7a`** `feat: campo - pwa e fila offline de criacoes - E12 US06`
  (9 arquivos) + **`0f13e2d`** `docs: registra fatia 1 do backlog E12 (pwa e
  fila offline)` — push em `main`.
- **Sem migration** (é só front-end) — deploy direto: `npx vercel --prod` →
  deployment **`mici-a2yyxu4dd-homeland1`** (alias `mici-theta.vercel.app`),
  build em ~47s, `/manifest.webmanifest` presente nas rotas estáticas.
- Smoke autenticado (`admin@mici.demo` / `Demo@1234`): login 200 ·
  `/api/v1/health` 200 · `/api/v1/projects` 200 · **`/manifest.webmanifest`
  200 (545 bytes)** · **`/sw.js` 200 (2275 bytes)** · `/projetos` 200 ·
  rota sem sessão → 401.

### Estado

- **Fatia 1 do backlog E12 em produção**; working tree limpa, `main` pushada
  (`0f13e2d`). Próximo passo decidido com o usuário: **Fatia 2** (fotos
  offline + regra de conflito + testes) ou **E14 Procurement**.

## 29/10/2026 (noite, parte 2) — E12-backlog, Fatia 2 (fotos offline + conflito)

Usuário pediu para seguir direto para a **Fatia 2** do backlog E12.

### Bug fix encontrado no caminho

- A rota **`POST /field/photos` ignorava o `clientUuid` do multipart** (não
  estava no `rawFields`), embora o schema aceitasse e `createPhoto` fizesse
  replay: **o reenvio da fila offline duplicaria a foto** em vez de devolver
  o original. Corrigido extraindo o parse para
  **`photoUploadFields(formData)`** em `src/modules/field/photos.ts`
  (testável sem HTTP — a rota agora delega).

### O que entrou

- **`src/lib/offline-queue.ts`** (estendido, compatível com itens da Fatia 1
  gravados no IndexedDB):
  - entity `"photo"` com **`file: Blob` persistido** + `fileName`/`mimeType`;
  - `method?: POST|PATCH` por item (legado sem method = POST);
  - `buildFormDataFor` monta o multipart; **`sendQueuedItem(item, transport)`**
    com `QueueTransport {json, upload}` **injetável** (produção usa
    `apiRequest`/`apiUpload`; testes usam mock puro);
  - `sendOrQueueEdit` (PATCH) e `sendOrQueuePhoto` (multipart) com a mesma
    classificação: online → envia; offline/ApiError 0 → fila; 4xx → relança.
- **Fotos offline** (`field-view.tsx`): validação de **MIME (allowlist) e teto
  de 4 MB antes** de enviar/enfileirar (evita 4xx surpresa no replay); envio
  online trocado do `fetch` cru pelo **`apiUpload`** (XHR com diagnóstico);
  enfileirado → "foto salva offline (até 4 MB)".
- **Regra de conflito implementada** (§4.2.6 do `devcurrent.md`):
  - criações: idempotência por `clientUuid` (já existia);
  - **edição offline só de entidade editável na hora** (diário DRAFT/REJECTED,
    tarefa/restrição abertas via `is*Editable` do engine) — **último-wins no
    rascunho**; no replay o **servidor revalida o status** (4xx → `failed`
    visível, descartável pelo banner);
  - medição (sem estados) enfileira sempre (last-wins puro);
  - transições e deletes continuam **sempre online**.
- **Testes**: unit +13 (`offline-queue.test.ts`: Blob, multipart, despacho
  POST/PATCH, edit/photo sent/queued/4xx, flush mista FIFO) · integração +1
  (`field.test.ts`: replay de foto por `clientUuid` no serviço + parse do
  multipart extraindo `clientUuid` e rejeitando `diaryId` inválido).

### Gate (29/10, 23h30) — tudo verde

- `npm run lint` ✅ · `npm run typecheck` ✅
- `npm test` ✅ **251 unit / 17 arquivos** (+13) ·
  `MICI_TEST_NO_RESET=1 npm run test:integration` ✅ **267 / 14** (+1)
- `npm run build` ✅
- **Playwright ficou de fora**: o repo não tem infra e2e (sem
  `playwright.config`); o mock de offline está coberto no Vitest (transporte
  injetável + stub de `navigator.onLine`). E2E real é opcional/futuro.

### Estado

- **Fatia 2 pronta, gate verde, não commitada** ao fim do desenvolvimento;
  na sequência, sob pedido do usuário: **commit + push + deploy + smoke**
  (abaixo).

### Commit e deploy (29/10, 23h40)

- Commits: **`dec1951`** `feat: campo - fotos offline e regra de conflito de
  edicao - E12 US02` (6 arquivos) + **`583496c`** `docs: registra fatia 2 do
  backlog E12 (fotos offline e conflito)` — push em `main`.
- **Sem migration** — deploy direto: `npx vercel --prod` → deployment
  **`mici-lnuvwqksg-homeland1`** (alias `mici-theta.vercel.app`), build ~39s.
- Smoke autenticado (`admin@mici.demo` / `Demo@1234`): login 200 ·
  `/api/v1/health` 200 · **`/field/photos` 200** · `/manifest.webmanifest`
  200 · `/sw.js` 200 · página `/projetos/[id]/campo` 200 (35 KB) · rota sem
  sessão → 401.

### Estado

- **Backlog E12 (PWA/fila offline) fechado de ponta a ponta** — Fatia 1 +
  Fatia 2 em produção; working tree limpa, `main` pushada. **Próximo épico:
  E14 Procurement** (decisão do usuário).
