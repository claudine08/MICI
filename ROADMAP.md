
# ROADMAP — MICI SaaS

Fonte: spec §§99–101 (Releases, Backlog de Implementação, Critérios de Aceite do MVP).
Status: ⬜ não iniciado · 🟦 em andamento · ✅ concluído.

## Gate de verificação entre fases

Antes de iniciar uma fase, a fase anterior deve passar na suíte completa:
`npm run lint` · `npm run typecheck` · `npm test` · `npm run test:integration` · `npm run build`.

Última execução (14/10/2026) — **Fase 4 (E07 + orçamento de cozinha) verificada**:

| Checagem | Resultado |
|---|---|
| `npm run lint` | ✅ sem erros |
| `npm run typecheck` | ✅ sem erros |
| `npm test` (unit) | ✅ 120 testes / 10 arquivos |
| `npm run test:integration` | ✅ 118 testes / 8 arquivos (tenant, gates, requisitos, WBS, schedule, baseline, calendários, import) |
| `npm run build` | ✅ build de produção (71 rotas; 52 endpoints `/api/v1`) |
| Migrations no banco local | ✅ 6 migrations (`init_foundation_identity` … `phase5_schedule_import`) |
| Smoke autenticado | ✅ login · `/orcamento` 200 · `POST /api/v1/budget/estimate` 200 (20 quantitativos) |

### Correção de ambiente e sessão (07/10/2026)

Bug reportado em `/selecionar-organizacao`: aviso **"Sessão expirada ou
ausente."** junto de "Olá, Paulo" e "Você ainda não participa de nenhuma
organização".

Causa raiz: split-brain de banco — o cookie JWT foi emitido contra o Postgres
local (`seed` de 03/10), mas o `next dev` passou a ler o `DATABASE_URL` do
`.env.local` (Neon, `vercel env pull` de 03/10 21:29). `userId` huérfano no
banco ativo ⇒ `POST /api/v1/organizations` respondia 401 e a lista de orgs
vinha vazia; a sessão *parecia* válida porque o JWT é stateless.

- [x] `.env.development.local` novo — fixa `DATABASE_URL` local para `next dev`
      (precedência confirmada sobre `.env.local` via `@next/env`
      `loadEnvConfig`); scripts npm já usavam `dotenv -e .env`, agora alinhados.
      Neon continua valendo para `next build`/`next start`.
- [x] `src/lib/auth.ts` — callback `session` revalida `token.userId` no banco;
      id inativo/huérfano remove `session.user.id` ⇒ `redirect("/entrar")` ou
      401 nos handlers, em vez de tela "logada" com backend rejeitando.
- [x] `src/modules/identity/services.ts` — checagem do ator em `createOrganization`
      dividida: usuário inexistente ⇒ novo código `SESSION_USER_NOT_FOUND` (401)
      com mensagem verdadeira; usuário desativado ⇒ `FORBIDDEN`.
- [x] Ambiente local recriado: Docker Desktop + `docker compose up -d`,
      `prisma migrate reset --force` (consentido) + 3 migrations + seed idempotente
      (5 usuários demo, org `demo`, todos os memberships `ACTIVE`).
- [x] Verificação: `npm run typecheck` ✅ · `eslint` nos arquivos alterados ✅ ·
      `loadEnvConfig` resolve `localhost:5432/mici` ✅ · linhas do seed conferidas
      no banco local ✅.
- [x] Smoke manual (14/10): `npm run dev` + Postgres portátil
      (`pg_ctl start`) + login `admin@mici.demo` ✅.
- [x] Suíte completa reexecutada (14/10) — ver tabela acima: todos os
      gates verdes (lint · typecheck · 120 unit · 118 integração · build).

### Produção: sync de dados + AUTH_URL (14/10/2026)

Login no Vercel falhava (`CredentialsSignin`) e os 302 do Auth.js apontavam
para `http://localhost:3000`. Duas causas independentes:

- [x] **Senhas dos perfis demo** — `gerente/pmo/viewer/qualidade@mici.demo`
      compartilhavam hash antigo que não correspondia a `Demo@1234`;
      redefinidas no Neon via `scripts/reset-profile-passwords.ts` (admin
      intocado). Verificado: login do gerente → sessão → `/painel` 200.
- [x] **`AUTH_URL` ausente no Vercel** — sem ela o Auth.js v5 deriva a URL
      base do request e, atrás do proxy do Vercel, caía no default
      `localhost:3000`. Adicionada `AUTH_URL=https://mici-theta.vercel.app`
      (Production) + redeploy; 302 agora sai para `/painel` no domínio
      correto.
- [x] **Dados dessincronizados (Neon ← local)** — o deploy de código estava
      atualizado, mas o Neon tinha 0 requisitos/0 WBS/0 atividades (telas
      vazias davam a impressão de funcionalidades ausentes). Sincronizado
      com `pg_dump`/`pg_restore` 18.6 (Neon é PG 18.6): backup prévio em
      `%TEMP%\mici-sync\neon-backup.dump`, depois restore do dump local —
      paridade total (mesmos UUIDs, 3 requisitos, 5 nós WBS, 66 atividades
      no EXAURA-001, 112 auditorias). Hash do admin preservado via
      `scripts/preserve-admin-hash.ts`.
- [x] Utilitários de diagnóstico commitados (`9c77e6c`): check-users,
      check-ids, check-coverage, check-activities, reset-profile-passwords,
      preserve-admin-hash.
- [x] Smoke pós-sync: login 302 → `https://mici-theta.vercel.app/painel` ·
      `/painel`/`/orcamento` 200 · WBS/requisitos/cronograma com dados ·
      EXAURA-001 66 atividades via API.

## Status do sistema (14/10/2026)

| Área | Situação |
|---|---|
| Fases concluídas | 0–3 completas (Fase 4 em andamento: E07 ✅, E08 ✅, E09 ⬜) |
| Épicos | E01–E08 ✅ · E09–E18 ⬜ |
| Testes | 132 unit (11 arquivos) + 118 integração (8 arquivos) — unit todos verdes; +1 teste de integração (`cost.test.ts`) escrito, não executado (consentimento pendente) |
| Migrations locais | 7 aplicadas (`init_foundation_identity` → `phase6_cost`) |
| Rotas | 83 no build (63 endpoints `/api/v1` + 20 páginas); `/custos`, `/projetos/[id]/custos` e API de cost novos |
| RBAC | módulo `COST` operante (`VIEW` na tela, `CREATE` na API de estimativa) |
| Banco local | PostgreSQL 17 portátil (`%LOCALAPPDATA%`), seed demo (5 usuários, `Demo@1234`) |
| Produção | Vercel `mici-theta.vercel.app` + Neon — código e dados sincronizados com o local (14/10); `AUTH_URL` configurada; `AUTH_SECRET` é Secret |
| Pendências imediatas | E09 Documents · rodar `npm run test:integration -- cost` sob consentimento (reseta `mici_test`) |
| Riscos/notas | Prisma Client precisa de `prisma generate` (postinstall); smoke local exigiu subir o Postgres portátil; testes de integração resetam o banco `mici_test` (consentimento registrado nesta sessão); backup pré-sync do Neon em `%TEMP%\mici-sync\neon-backup.dump` |

## Releases (produto)

| Release | Escopo |
|---|---|
| **Release 1** | Projetos, templates, requisitos, WBS, gates, cronograma básico, orçamento, físico, documentos, riscos, mudanças, qualidade, dashboards, auditoria |
| **Release 2** | Suprimentos, contratos, RFI, reuniões, comissionamento, garantia, importação/exportação avançada, planejamento curto prazo |
| **Release 3** | EVM avançado, portfólio, ERP, BIM/CDE, cenários, análise quantitativa de risco |
| **Release 4** | IA, busca semântica, automações, IoT, telemetria, visão computacional |

## Épicos (E01–E18) e status

| Épico | Escopo resumido | Status |
|---|---|---|
| **E01 Platform Foundation** | Base do sistema, CI, observabilidade | ✅ Fase 0 |
| **E02 Identity** | Usuário↔organização, roles, permissions, tenant isolation | ✅ Fase 0/1 (OIDC/Keycloak no backlog) |
| **E03 Project** | Organization, Client, Project, ProjectTemplate, clonagem | ✅ Fase 2 (clonagem plena em Fase 3+) |
| **E04 Requirements** | Requisito, versionamento, vínculo WBS/evidência, DRP | ✅ Fase 3 |
| **E05 WBS** | Árvore, reordenar, importar/exportar, versionar | ✅ Fase 3 |
| **E06 Gates** | GateDefinition/Instance, critérios, aprovação, bloqueio (BR-001/002), auditoria | ✅ Fase 2 |
| **E07 Schedule** | Atividades, dependências, calendário, baseline, forecast, caminho crítico | ✅ Fase 4 |
| **E08 Cost** | Budget, CostItem, Commitment, Actual, Forecast, EVM | ✅ Fase 4 — itens/compromissos/realizados/EVM, baseline COST, gate G4, import do `estimate`, telas `/custos` e `/projetos/[id]/custos` |
| **E09 Documents** | Upload, revisão, aprovação, release, link de objetos | ⬜ |
| **E10 Risk** | Risk register, matriz, resposta, risco residual | ⬜ |
| **E11 Change** | Request, impacto, aprovação, baseline revision, implementation | ⬜ |
| **E12 Field** | Diário, foto, tarefa, avanço, restrição, mobile/PWA | ⬜ |
| **E13 Quality** | Checklist, inspeção, NCR, ação corretiva, punch list | ⬜ |
| **E14 Procurement** | Purchase request, cotação, comparação, aprovação, PO, recebimento | ⬜ |
| **E15 Commissioning** | Plano, teste, reteste, aceite | ⬜ |
| **E16 Sustainability** | PSP, baseline, metas, medições, resíduo, relatório ambiental | ⬜ |
| **E17 Dashboard** | Portfólio, executivo, projeto, campo | ⬜ |
| **E18 AI** | AI Gateway, prompts, extração, resumo diário, classificação, busca | ⬜ |

> Desvio registrado (ADR-014): a spec original previa Django + React
> (E01-US01/US02); a decisão aprovada de arquitetura é **Next.js full-stack**
> no mesmo monolito modular — os épicos permanecem válidos, o stack muda.

## Plano de execução por fases

### Fase 0 — Foundation ✅

- [x] Scaffold Next 16 + TypeScript + Tailwind 4 + configs (lint/typecheck/format/CI)
- [x] Prisma 7 + schema base: tenancy, usuários, memberships, papéis,
      permissões, auditoria (append-only), outbox `domain_events`, `job_queue`
- [x] Migration inicial aplicada + seed idempotente (catálogo 200 permissões,
      18 papéis/organização, org demo, 5 usuários demo)
- [x] Auth.js v5 (JWT + scrypt), página `/entrar`, sessão
- [x] Contexto de tenant (`organization_id` via cookie validado) + API
      `/api/v1/session/context` (GET/POST) + `/api/v1/organizations` +
      `/api/v1/health`
- [x] Shell do app (sidebar/topbar/org switcher) + `/painel`
- [x] RBAC com matriz 18×25×8 + `can()` + testes unitários (15 testes)
- [x] Contrato de erro único da API (códigos + status + correlation_id)
- [x] GitHub Actions CI (lint → typecheck → test → build)
- [x] README (runbook), ROADMAP, ADR-014/ADR-015

### Fase 1 — Identity/Tenancy (E02) ✅

- [x] UI de administração: usuários, convites, papéis e permissões
      (`/administracao/usuarios`, `/administracao/papeis`)
- [x] Troca de organização completa + guarda de rotas
      (`/selecionar-organizacao` + guards em layout/entrar)
- [x] Testes automatizados de isolamento de tenant no CI
      (13 testes em `tests/integration/tenant-isolation.test.ts` + Postgres service)
- [x] Trilha de auditoria visível (`/administracao/auditoria` com filtros e
      histórico por objeto)
- [x] Salvaguardas: auto-bloqueio de edição da própria membresia; proteção do
      último ADMIN ativo; papéis do sistema imutáveis

### Fase 2 — Portfólio e Projetos (E03) + Gates (E06) ✅

- [x] CRUD Project/Client/ProjectTemplate com validação e escopo de tenant
      (`/projetos`, `/clientes`, `/templates` + 6 endpoints `/api/v1`)
- [x] Gates G0–G8 oficiais (§17/§18) criados por organização; gates
      customizados em `/administracao/gates`
- [x] GateInstance com snapshot de critérios imutável na criação do projeto
      (§15.1) + evidências + aprovações (múltiplo aprover por `minimumApprovals`)
- [x] Bloqueio BR-001 (avanço de fase depende de gates aprovados/dispensados) e
      BR-002 (aprovação exige critérios obrigatórios + evidência) com auditoria
      de decisão (start/submit/analyze/approve/reject/waive)
- [x] Detalhe de projeto com stepper de fases F0–F10 e tabela de gates
      (`/projetos/[id]`)
- [x] Navegação completa do shell (Projetos/Clientes/Templates + Gates em
      Administração) e `/painel` com portfólio real
- [x] Testes: 15 unitários do motor de gates + 16 de integração
      (`project-gates.test.ts`, inclui isolamento cross-tenant)

### Fase 3 — Requirements/DRP (E04) + WBS (E05) ✅

- [x] Modelos Prisma + migration `phase3_requirements_wbs`
      (`Requirement`, `RequirementRevision`, `RequirementEvidence`, `WBSNode`,
      `WBSVersion`)
- [x] Requisitos versionados (toda edição gera revisão), transição de status
      com máquina de estados, vínculo com WBS, evidências (BR-008) e regra
      BR-015 para categoria COMPLIANCE
- [x] Geração de DRP (§20) em `/api/v1/projects/[id]/drp` + página
      `/projetos/[id]/requisitos` e visão global `/requisitos`
- [x] Árvore de WBS com numeração automática, reordenação, mover, duplicar,
      importação (merge por código, preserva payload original) e exportação
      JSON/CSV (`/projetos/[id]/wbs`)
- [x] Versionamento da árvore (`WBSVersion`) com snapshots
- [x] Gate G1 passa a exigir DRP completo (§18-G1): todos os requisitos vivos
      com critérios de aceite + responsável e ≥1 evidência, com
      `REQUIREMENTS_INCOMPLETE` listando os bloqueios
- [x] 16 endpoints `/api/v1` (requisitos, evidências, revisões, DRP, WBS,
      reorder, import/export, versões, duplicar nó)
- [x] Testes: 38 unit (motor de requisitos + motor WBS) + 29 de integração
      (BR-008/BR-015, versionamento, G1, CRUD WBS, importação/exportação)

### Fase 4 — Planejamento e Custos (E07, E08), Documentos (E09) 🟦

**E07 Schedule ✅** (ver DIARIO 08/10 — commits locais `phase4_schedule*`):

- [x] Modelos + migrations `phase4_schedule`, `phase4_schedule_baseline`,
      `phase5_schedule_import` (Activity, Dependency, Baseline,
      ScheduleTemplate, calendários)
- [x] Motor de CPM com ciclo/sindependência, marcos, resumos, críticas;
      aplicação de calendário (semana útil + feriados) e recálculo de datas
- [x] Baseline com snapshot imutável + comparativo (pendente/atrasado/
      adiantado); `forecastFinish` persistido
- [x] Telas `/projetos/[id]/cronograma` (árvore, dependências, críticas,
      baseline) e visão única `/cronograma` (item de menu habilitado)
- [x] Importação MS Project (CSV/XML) com validação de grafo + replace-all,
      templates de cronograma reutilizáveis (`/templates`) e aplicação de
      calendário ao cronograma (recalcula e audita)
- [x] Testes: 120 unit + 118 integração totais do repositório (schedule,
      baseline, calendários, import com fixtures MS Project)

**E08 Cost ✅** — orçamento de cozinha + Cost/EVM (14/10):

- [x] Módulo stateless `src/modules/budget` (premissas → dimensionamento →
      quantitativos grupos 1–15 → indiretos/reserva/BDI), memória de cálculo
      de `memoria_calculo.txt`, tabela de preços editável com defaults
      ilustrativos (fonte/data-base por PU)
- [x] `POST /api/v1/budget/estimate` (`COST:CREATE`, sem persistência) +
      tela `/orcamento` (assistente de 6 passos) + item "Orçamento de
      cozinha" na sidebar; exportação JSON/CSV como entrada da fase de
      orçamentação
- [x] Testes: +24 unit (`budget-engine`, `budget-export`)
- [x] Migration `phase6_cost` + módulo `src/modules/cost` (itens,
      compromissos, realizados, EVM puro, baselines COST, import do
      `estimate` de `/orcamento` com replace-all) — 14/10 (noite)
- [x] API de cost sob `/projects/[id]/cost/` (itens/commitments/actuals/
      baselines/evm/import-estimate/summary) com audit + domain events
- [x] Gate G4: `COST_BASELINE_REQUIRED` (409) bloqueia aprovação quando há
      itens de custo vivos sem baseline COST aprovada
- [x] UI: `/projetos/[id]/custos` (EVM + CRUD + import) e `/custos`
      (vis portfolio); item "Custos" na sidebar
- [x] Testes: +12 unit (`cost-engine`); `tests/integration/cost.test.ts`
      escrito (não executado — harness de integração usa
      `prisma db push --force-reset`, exige consentimento humano)

**E09 Documents ⬜**:

- [ ] Documentos com revisão e aprovação

### Fase 5+ — Releases 1→4 ⬜

Executar épicos E10–E18 conforme prioridade de Release 1, depois Releases 2–4.

## Critérios de aceite do MVP (§101)

O MVP é aceito quando um projeto real executar o ciclo completo:

```text
Oportunidade → Requisitos → Orçamento → Projeto → Baseline → Execução →
Avanço → Custo → Risco → Mudança → Qualidade → Comissionamento →
Aceite → Encerramento
```

Além disso: múltiplos projetos, permissões, histórico, origem de indicadores,
exportação, backup, auditoria e isolamento de tenants.

Cenário E2E automatizado: §102 (34 passos, de "criar tenant" a "aprovar G8").

## Gates do projeto de implantação (referência)

G0 Oportunidade qualificada · G1 Requisitos suficientes · G2 Viabilidade ·
G3 Proposta/orçamento · G4 Contrato e plano · G5 Projeto liberado ·
G6 Pronto para comissionamento · G7 Aceite operacional · G8 Encerramento
