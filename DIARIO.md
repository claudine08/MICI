# DIÁRIO DE DESENVOLVIMENTO — MICI SaaS

Registro cronológico do que foi feito. Fontes: este arquivo, `ROADMAP.md`,
histórico git e ADRs. Datas em DD/MM/AAAA.

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
