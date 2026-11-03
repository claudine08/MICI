
# ROADMAP â€” MICI SaaS

Fonte: spec Â§Â§99â€“101 (Releases, Backlog de ImplementaÃ§Ã£o, CritÃ©rios de Aceite do MVP).
Status: â¬œ nÃ£o iniciado Â· ðŸŸ¦ em andamento Â· âœ… concluÃ­do.

> **VisÃ£o de produto/histÃ³rica** â€” para retomar o desenvolvimento use
> **`devcurrent.md`** (prÃ³xima frente, ambiente e comandos); este arquivo
> registra o status dos Ã©picos para consulta.

## Gate de verificaÃ§Ã£o entre fases

Antes de iniciar uma fase, a fase anterior deve passar na suÃ­te completa:
`npm run lint` Â· `npm run typecheck` Â· `npm test` Â· `npm run test:integration` Â· `npm run build`.

Ãšltima execuÃ§Ã£o (15/10/2026) â€” **Fase 4 completa (E07 + E08 + E09) verificada**:

| Checagem | Resultado |
|---|---|
| `npm run lint` | âœ… sem erros |
| `npm run typecheck` | âœ… sem erros |
| `npm test` (unit) | âœ… 142 testes / 12 arquivos |
| `npm run test:integration` | âœ… 162 testes / 10 arquivos (tenant, gates, requisitos, WBS, schedule, baseline, calendÃ¡rios, import, **cost**, **documents**) |
| `npm run build` | âœ… build de produÃ§Ã£o (96 rotas; 75 endpoints `/api/v1`) |
| Migrations no banco local | âœ… 8 migrations (`init_foundation_identity` â€¦ `phase7_documents`) |
| Smoke autenticado | âœ… login Â· `/orcamento` 200 Â· `POST /api/v1/budget/estimate` 200 (20 quantitativos) |

### CorreÃ§Ã£o de ambiente e sessÃ£o (07/10/2026)

Bug reportado em `/selecionar-organizacao`: aviso **"SessÃ£o expirada ou
ausente."** junto de "OlÃ¡, Paulo" e "VocÃª ainda nÃ£o participa de nenhuma
organizaÃ§Ã£o".

Causa raiz: split-brain de banco â€” o cookie JWT foi emitido contra o Postgres
local (`seed` de 03/10), mas o `next dev` passou a ler o `DATABASE_URL` do
`.env.local` (Neon, `vercel env pull` de 03/10 21:29). `userId` huÃ©rfano no
banco ativo â‡’ `POST /api/v1/organizations` respondia 401 e a lista de orgs
vinha vazia; a sessÃ£o *parecia* vÃ¡lida porque o JWT Ã© stateless.

- [x] `.env.development.local` novo â€” fixa `DATABASE_URL` local para `next dev`
      (precedÃªncia confirmada sobre `.env.local` via `@next/env`
      `loadEnvConfig`); scripts npm jÃ¡ usavam `dotenv -e .env`, agora alinhados.
      Neon continua valendo para `next build`/`next start`.
- [x] `src/lib/auth.ts` â€” callback `session` revalida `token.userId` no banco;
      id inativo/huÃ©rfano remove `session.user.id` â‡’ `redirect("/entrar")` ou
      401 nos handlers, em vez de tela "logada" com backend rejeitando.
- [x] `src/modules/identity/services.ts` â€” checagem do ator em `createOrganization`
      dividida: usuÃ¡rio inexistente â‡’ novo cÃ³digo `SESSION_USER_NOT_FOUND` (401)
      com mensagem verdadeira; usuÃ¡rio desativado â‡’ `FORBIDDEN`.
- [x] Ambiente local recriado: Docker Desktop + `docker compose up -d`,
      `prisma migrate reset --force` (consentido) + 3 migrations + seed idempotente
      (5 usuÃ¡rios demo, org `demo`, todos os memberships `ACTIVE`).
- [x] VerificaÃ§Ã£o: `npm run typecheck` âœ… Â· `eslint` nos arquivos alterados âœ… Â·
      `loadEnvConfig` resolve `localhost:5432/mici` âœ… Â· linhas do seed conferidas
      no banco local âœ….
- [x] Smoke manual (14/10): `npm run dev` + Postgres portÃ¡til
      (`pg_ctl start`) + login `admin@mici.demo` âœ….
- [x] SuÃ­te completa reexecutada (14/10) â€” ver tabela acima: todos os
      gates verdes (lint Â· typecheck Â· 120 unit Â· 118 integraÃ§Ã£o Â· build).

### ProduÃ§Ã£o: sync de dados + AUTH_URL (14/10/2026)

Login no Vercel falhava (`CredentialsSignin`) e os 302 do Auth.js apontavam
para `http://localhost:3000`. Duas causas independentes:

- [x] **Senhas dos perfis demo** â€” `gerente/pmo/viewer/qualidade@mici.demo`
      compartilhavam hash antigo que nÃ£o correspondia a `Demo@1234`;
      redefinidas no Neon via `scripts/reset-profile-passwords.ts` (admin
      intocado). Verificado: login do gerente â†’ sessÃ£o â†’ `/painel` 200.
- [x] **`AUTH_URL` ausente no Vercel** â€” sem ela o Auth.js v5 deriva a URL
      base do request e, atrÃ¡s do proxy do Vercel, caÃ­a no default
      `localhost:3000`. Adicionada `AUTH_URL=https://mici-theta.vercel.app`
      (Production) + redeploy; 302 agora sai para `/painel` no domÃ­nio
      correto.
- [x] **Dados dessincronizados (Neon â† local)** â€” o deploy de cÃ³digo estava
      atualizado, mas o Neon tinha 0 requisitos/0 WBS/0 atividades (telas
      vazias davam a impressÃ£o de funcionalidades ausentes). Sincronizado
      com `pg_dump`/`pg_restore` 18.6 (Neon Ã© PG 18.6): backup prÃ©vio em
      `%TEMP%\mici-sync\neon-backup.dump`, depois restore do dump local â€”
      paridade total (mesmos UUIDs, 3 requisitos, 5 nÃ³s WBS, 66 atividades
      no EXAURA-001, 112 auditorias). Hash do admin preservado via
      `scripts/preserve-admin-hash.ts`.
- [x] UtilitÃ¡rios de diagnÃ³stico commitados (`9c77e6c`): check-users,
      check-ids, check-coverage, check-activities, reset-profile-passwords,
      preserve-admin-hash.
- [x] Smoke pÃ³s-sync: login 302 â†’ `https://mici-theta.vercel.app/painel` Â·
      `/painel`/`/orcamento` 200 Â· WBS/requisitos/cronograma com dados Â·
      EXAURA-001 66 atividades via API.

## Status do sistema (29/10/2026)

| Ãrea | SituaÃ§Ã£o |
|---|---|
| Fases concluÃ­das | 0â€“4 completas (E07 âœ…, E08 âœ…, E09 âœ…, E10 âœ…) Â· E11 âœ… Â· E12 **Fatia 1** âœ… / **Fatia 2** âœ… / **backlog Fatia 1** âœ… / **backlog Fatia 2** âœ… (todas em produÃ§Ã£o) Â· E13 **Fatia 1** âœ… / **Fatia 2a** âœ… / **Fatia 2b** âœ… (produÃ§Ã£o) |
| Ã‰picos | E01â€“E14 âœ… (**E14 completo: Fatia 1+2 em produÃ§Ã£o**) Â· **E12-backlog PWA/fila offline âœ… completo e em produÃ§Ã£o (29/10)** Â· E15â€“E18 â¬œ |
| Testes | 251 unit (17 arquivos) + 267 integraÃ§Ã£o (14 arquivos) â€” todos verdes (integraÃ§Ã£o com `MICI_TEST_NO_RESET=1`, sem reset do `mici_test`) |
| Migrations | 16 aplicadas (`init_foundation_identity` â†’ `phase14_punch`), todas no Neon (16Âª em 29/10) |
| Rotas | 110 arquivos de rota `/api/v1` (17 em `projects/[id]/quality/*`) + 30 pÃ¡ginas |
| RBAC | mÃ³dulos `COST`, `DOCUMENT`, `RISK`, `CHANGE`, `FIELD` e `QUALITY` operantes (`VIEW/CREATE/EDIT/DELETE/APPROVE/REJECT/ADMIN` por aÃ§Ã£o na API) |
| Banco local | PostgreSQL 17 portÃ¡til (`%LOCALAPPDATA%`), seed demo (5 usuÃ¡rios, `Demo@1234`); sobe via tarefa agendada `mici-postgres` â€” **29/10: settings ajustadas p/ bateria** (`DisallowStartIfOnBatteries=False`), senÃ£o a tarefa fica "Queued" |
| ProduÃ§Ã£o | Vercel `mici-theta.vercel.app` + Neon â€” Ãºltimo deploy 29/10 (`mici-lnuvwqksg-homeland1`, commit `dec1951`, E12-backlog Fatia 2: fotos offline + conflito, sem migration; 16 migrations no Neon); `AUTH_URL` configurada; `AUTH_SECRET` Ã© Secret |
| PendÃªncias imediatas | **Backlog E12 fechado** â€” abrir o prÃ³ximo Ã©pico (**E14 Procurement**) a cargo do usuÃ¡rio |
| Riscos/notas | Prisma CLI nÃ£o conecta em `localhost` (IPv6) nesta mÃ¡quina â€” `.env*` usam `127.0.0.1`; testes de integraÃ§Ã£o resetam `mici_test` por default (`--force-reset`) â€” **Prisma 7 exige consentimento explÃ­cito para comandos destrutivos** (`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`; autorizado pelo usuÃ¡rio em 22/10 por causa dos unique constraints novos de `clientUuid`); Prisma 7: `migrate diff` usa `--to-schema` (sem `--shadow-database-url`, vem do config); backup prÃ©-sync do Neon em `%TEMP%\mici-sync\neon-backup.dump`; upload direto de arquivo **OneDrive online-only** falha no browser (copiar local antes de enviar â€” a mensagem de erro do MICI jÃ¡ orienta) |

### Incidente de upload (21/10/2026) â€” resolvido

- Relato: "Falha de conexÃ£o" ao enviar documentos em produÃ§Ã£o. DiagnÃ³stico
  via XHR com progresso: arquivo de 15 KB com **0 bytes enviados** e
  servidor OK â€” o browser nÃ£o conseguia ler arquivos do OneDrive em modo
  online (nuvem). NÃ£o Ã© bug do MICI.
- CorreÃ§Ãµes que ficaram no produto (commits `6401472`, `66c628e`,
  `e245549`, `ed299f5`): `Content-Type` multipart correto, validaÃ§Ã£o 4 MB
  no cliente, upload via XHR com progresso, erro visÃ­vel dentro do
  diÃ¡logo, sonda `/api/v1/health` apÃ³s falha e orientaÃ§Ã£o sobre OneDrive
  na mensagem. Detalhes no DIARIO 21/10.

## Releases (produto)

| Release | Escopo |
|---|---|
| **Release 1** | Projetos, templates, requisitos, WBS, gates, cronograma bÃ¡sico, orÃ§amento, fÃ­sico, documentos, riscos, mudanÃ§as, qualidade, dashboards, auditoria |
| **Release 2** | Suprimentos, contratos, RFI, reuniÃµes, comissionamento, garantia, importaÃ§Ã£o/exportaÃ§Ã£o avanÃ§ada, planejamento curto prazo |
| **Release 3** | EVM avanÃ§ado, portfÃ³lio, ERP, BIM/CDE, cenÃ¡rios, anÃ¡lise quantitativa de risco |
| **Release 4** | IA, busca semÃ¢ntica, automaÃ§Ãµes, IoT, telemetria, visÃ£o computacional |

## Ã‰picos (E01â€“E18) e status

| Ã‰pico | Escopo resumido | Status |
|---|---|---|
| **E01 Platform Foundation** | Base do sistema, CI, observabilidade | âœ… Fase 0 |
| **E02 Identity** | UsuÃ¡rioâ†”organizaÃ§Ã£o, roles, permissions, tenant isolation | âœ… Fase 0/1 (OIDC/Keycloak no backlog) |
| **E03 Project** | Organization, Client, Project, ProjectTemplate, clonagem | âœ… Fase 2 (clonagem plena em Fase 3+) |
| **E04 Requirements** | Requisito, versionamento, vÃ­nculo WBS/evidÃªncia, DRP | âœ… Fase 3 |
| **E05 WBS** | Ãrvore, reordenar, importar/exportar, versionar | âœ… Fase 3 |
| **E06 Gates** | GateDefinition/Instance, critÃ©rios, aprovaÃ§Ã£o, bloqueio (BR-001/002), auditoria | âœ… Fase 2 |
| **E07 Schedule** | Atividades, dependÃªncias, calendÃ¡rio, baseline, forecast, caminho crÃ­tico | âœ… Fase 4 |
| **E08 Cost** | Budget, CostItem, Commitment, Actual, Forecast, EVM + rastreio por WBS/atividade + fluxo de caixa CSV | âœ… Fase 4 + E08+ (01/11): itens/compromissos/realizados/EVM, baseline COST, gate G4, import do `estimate`, telas `/custos` e `/projetos/[id]/custos`; **rastreio por WBS/atividade** (CostItem/Commitment/Actual carregam wbsNodeId/activityId), **integraÃ§Ã£o Procurementâ†’Cost** (PO emitido â†’ CostCommitment; recebimento confirmado â†’ CostActual), **fluxo de caixa CSV** (export/import em `/cost/cashflow`), migration `phase17_cost_tracking` |
| **E09 Documents** | Upload, revisÃ£o, aprovaÃ§Ã£o, release, link de objetos | âœ… Fase 4 |
| **E10 Risk** | Risk register, matriz, resposta, risco residual | âœ… Fase 4 â€” risk register com ciclo Identifyâ†’â€¦â†’Close, matriz 5Ã—5 configurÃ¡vel por organizaÃ§Ã£o, respostas (RiskResponse histÃ³rico), risco residual no CLOSE, escalada CRITICAL (domain events), telas `/riscos` e `/projetos/[id]/riscos` |
| **E11 Change** | Request, impacto, aprovaÃ§Ã£o, baseline revision, implementation | âœ… Fase 4 â€” ChangeRequest (CR001 automÃ¡tico, ciclo DRAFTâ†’â€¦â†’CLOSED), anÃ¡lise de impacto 11 dimensÃµes (ChangeImpact upsert, severidade agregada), aprovaÃ§Ã£o append-only (ChangeApproval), implementaÃ§Ã£o vincula Baseline via `Baseline.changeRequestId` (BR-005), telas `/mudancas` e `/projetos/[id]/mudancas` |
| **E12 Field** | DiÃ¡rio, foto, tarefa, avanÃ§o, restriÃ§Ã£o, mobile/PWA | âœ… Fatiado â€” **Fatia 1** (produÃ§Ã£o): `FieldDiary` (FD001, um por data, DRAFTâ†’SUBMITTEDâ†’APPROVED/REJECTED com `FIELD:APPROVE`), `FieldTask` (FT001), `Constraint` (CN001, OPENâ†’ADDRESSEDâ†’REMOVED), `PhotoEvidence` (PH001, bytea 4 MB + SHA-256, allowlist de imagem), API `field/*` (14 rotas), telas `/campo` e `/projetos/[id]/campo`, item "Campo" na nav. **Fatia 2** (produÃ§Ã£o): `ProgressMeasurement` (PM001, BR-006 â€” mÃ©todo+percentual+quantidade fÃ­sica+`criterion` obrigatÃ³rio, nÃ­veis PROJECT/WBS/ACTIVITY, sincroniza `physicalProgress` auditado em PROGRESS), idempotÃªncia offline `clientUuid` em todas as entidades de campo (Â§38), fotos com vÃ­nculo WBS/atividade, aba "AvanÃ§o" + avanÃ§o fÃ­sico mÃ©dio na home. **Backlog Fatia 1** (produÃ§Ã£o, 29/10): manifest (`src/app/manifest.ts` â†’ `/manifest.webmanifest`) + service worker (`public/sw.js`, cache-first `/_next/static/` + network-first de navegaÃ§Ãµes) + fila offline IndexedDB (`src/lib/offline-queue.ts`, criaÃ§Ãµes de diÃ¡rio/tarefa/restriÃ§Ã£o/mediÃ§Ã£o com `clientUuid` idempotente; FIFO, 4xx â†’ falha definitiva visÃ­vel, rede â†’ pendente) + banner "Sincronizar agora"/"Descartar falhas" na UI de campo. **Backlog Fatia 2** (produÃ§Ã£o, 29/10): **foto offline** (Blob no IndexedDB, multipart via `sendQueuedItem`/`QueueTransport` injetÃ¡vel, validaÃ§Ã£o MIME+4 MB antes de enfileirar, bug fix: rota `POST field/photos` agora lÃª `clientUuid` do form via `photoUploadFields`) + **regra de conflito** (ediÃ§Ã£o offline sÃ³ de rascunho editÃ¡vel com Ãºltimo-wins, replay revalida status no servidor â†’ 4xx vira falha visÃ­vel; transiÃ§Ãµes/sempre online) + testes (251 unit / 267 integraÃ§Ã£o). Fora: e2e Playwright (sem infra no repo) |
| **E13 Quality** | Checklist, inspeÃ§Ã£o, NCR, aÃ§Ã£o corretiva, punch list | âœ… **Completo no cÃ³digo** â€” **Fatia 1** (produÃ§Ã£o, 24/10): `ChecklistTemplate` (CT001, `items Json`), `ChecklistExecution` (CE001, snapshot do modelo + respostas PASS/FAIL/NA, DRAFTâ†’COMPLETED/CANCELLED, sÃ³ edita rascunho), `Inspection` (IN001, `criterion` obrigatÃ³rio, PLANNEDâ†’EXECUTEDâ†’PASSED/FAILEDâ†’CLOSED + CANCELLED, PASS/FAIL exige **evidÃªncia** â€” foto vinculada ou checklist concluÃ­do, FAIL exige `resultNotes`), fotos com `inspectionId` (evidÃªncia + filtro `?inspectionId=`), API `quality/*` (8 rotas, `QUALITY:VIEW/CREATE/EDIT/DELETE`), telas `/qualidade` (resumo por projeto) e `/projetos/[id]/qualidade` (Modelos/ExecuÃ§Ãµes/InspeÃ§Ãµes), item "Qualidade" na nav. **Fatia 2a** (produÃ§Ã£o, 27/10): `NonConformity` (NC001, OPENâ†’CORRECTIONâ†’VERIFICATIONâ†’CLOSED + CANCELLED; **FAIL cria NCR automÃ¡tico**; CLOSE de inspeÃ§Ã£o reprovada gateado em NCR resolvido) e `CorrectiveAction` (CA001, OPENâ†’IN_PROGRESSâ†’DONEâ†’VERIFIEDâ†’CLOSED, vinculada ao NCR, responsÃ¡vel+prazo), 10 rotas, abas "NÃ£o conformidades"/"AÃ§Ãµes corretivas". **Fatia 2b** (produÃ§Ã£o, 29/10): `PunchItem` (PX001, OPENâ†’ASSIGNEDâ†’IN_PROGRESSâ†’READY_FOR_VERIFICATIONâ†’VERIFIEDâ†’CLOSED, REJECTEDâ†’IN_PROGRESS, **sem CANCELLED**; ASSIGN exige responsÃ¡vel, SUBMIT exige **foto da correÃ§Ã£o**, VERIFY grava `verifiedBy`/`At`; prioridade `FieldPriority`, prazo com destaque de vencido, vÃ­nculos WBS/atividade/fotos), 3 rotas, aba "Punch list", migration `phase14_punch` (commit `01a0966`, no Neon; deploy `mici-nb8dr9z1l-homeland1`, smoke verde) |
| **E14 Procurement** | Completo (Fatia 1+2): Fatia 1 (produÃ§Ã£o, 30/10) â€” fornecedores (SP), requisiÃ§Ãµes (PR), cotaÃ§Ãµes (QT), mapa comparativo (BC); Fatia 2 â€” PO (`PO001`) + recebimento (`GR001`), rotas `procurement/orders` e `procurement/receipts`, migration `phase16_procurement`. Commits `2ea90bb` â€¦ `9e5c259`. | âœ… Completo |
| **E15 Commissioning** | Plano, teste, reteste, aceite | âœ… Implementado e em produÃ§Ã£o (02/11) | â¬œ |
| **E16 Sustainability** | PSP, baseline, metas, medicoes, residuo, relatorio ambiental | Implementado e em producao (02/11) |
| **E17 Dashboard** | Portfólio, executivo, projeto, campo | Implementado e em produção (02/11) |
| **E18 AI** | AI Gateway, prompts, extração, resumo diário, classificação, busca semântica | Implementado e em produção (02/11) |
| **E19 Project Dashboard** | Dashboard de projetos no painel (portfÃ³lio + drill-down): datas inÃ­cio/fim (planejado/real), custos (planejado/real), percentuais planejado/real por data de reporte (as-of), KPIs (PV/EV/AC/SPI/CPI), curva S, Gantt resumido, burndown, heat map de riscos, alertas. Visuais com Recharts (curva S, burndown, heat map). Inspirado em Power BI/Jira. | âœ… Completo (Fatia 1+2+3 em produÃ§Ã£o) |

> Desvio registrado (ADR-014): a spec original previa Django + React
> (E01-US01/US02); a decisÃ£o aprovada de arquitetura Ã© **Next.js full-stack**
> no mesmo monolito modular â€” os Ã©picos permanecem vÃ¡lidos, o stack muda.

## Plano de execuÃ§Ã£o por fases

### Fase 0 â€” Foundation âœ…

- [x] Scaffold Next 16 + TypeScript + Tailwind 4 + configs (lint/typecheck/format/CI)
- [x] Prisma 7 + schema base: tenancy, usuÃ¡rios, memberships, papÃ©is,
      permissÃµes, auditoria (append-only), outbox `domain_events`, `job_queue`
- [x] Migration inicial aplicada + seed idempotente (catÃ¡logo 200 permissÃµes,
      18 papÃ©is/organizaÃ§Ã£o, org demo, 5 usuÃ¡rios demo)
- [x] Auth.js v5 (JWT + scrypt), pÃ¡gina `/entrar`, sessÃ£o
- [x] Contexto de tenant (`organization_id` via cookie validado) + API
      `/api/v1/session/context` (GET/POST) + `/api/v1/organizations` +
      `/api/v1/health`
- [x] Shell do app (sidebar/topbar/org switcher) + `/painel`
- [x] RBAC com matriz 18Ã—25Ã—8 + `can()` + testes unitÃ¡rios (15 testes)
- [x] Contrato de erro Ãºnico da API (cÃ³digos + status + correlation_id)
- [x] GitHub Actions CI (lint â†’ typecheck â†’ test â†’ build)
- [x] README (runbook), ROADMAP, ADR-014/ADR-015

### Fase 1 â€” Identity/Tenancy (E02) âœ…

- [x] UI de administraÃ§Ã£o: usuÃ¡rios, convites, papÃ©is e permissÃµes
      (`/administracao/usuarios`, `/administracao/papeis`)
- [x] Troca de organizaÃ§Ã£o completa + guarda de rotas
      (`/selecionar-organizacao` + guards em layout/entrar)
- [x] Testes automatizados de isolamento de tenant no CI
      (13 testes em `tests/integration/tenant-isolation.test.ts` + Postgres service)
- [x] Trilha de auditoria visÃ­vel (`/administracao/auditoria` com filtros e
      histÃ³rico por objeto)
- [x] Salvaguardas: auto-bloqueio de ediÃ§Ã£o da prÃ³pria membresia; proteÃ§Ã£o do
      Ãºltimo ADMIN ativo; papÃ©is do sistema imutÃ¡veis

### Fase 2 â€” PortfÃ³lio e Projetos (E03) + Gates (E06) âœ…

- [x] CRUD Project/Client/ProjectTemplate com validaÃ§Ã£o e escopo de tenant
      (`/projetos`, `/clientes`, `/templates` + 6 endpoints `/api/v1`)
- [x] Gates G0â€“G8 oficiais (Â§17/Â§18) criados por organizaÃ§Ã£o; gates
      customizados em `/administracao/gates`
- [x] GateInstance com snapshot de critÃ©rios imutÃ¡vel na criaÃ§Ã£o do projeto
      (Â§15.1) + evidÃªncias + aprovaÃ§Ãµes (mÃºltiplo aprover por `minimumApprovals`)
- [x] Bloqueio BR-001 (avanÃ§o de fase depende de gates aprovados/dispensados) e
      BR-002 (aprovaÃ§Ã£o exige critÃ©rios obrigatÃ³rios + evidÃªncia) com auditoria
      de decisÃ£o (start/submit/analyze/approve/reject/waive)
- [x] Detalhe de projeto com stepper de fases F0â€“F10 e tabela de gates
      (`/projetos/[id]`)
- [x] NavegaÃ§Ã£o completa do shell (Projetos/Clientes/Templates + Gates em
      AdministraÃ§Ã£o) e `/painel` com portfÃ³lio real
- [x] Testes: 15 unitÃ¡rios do motor de gates + 16 de integraÃ§Ã£o
      (`project-gates.test.ts`, inclui isolamento cross-tenant)

### Fase 3 â€” Requirements/DRP (E04) + WBS (E05) âœ…

- [x] Modelos Prisma + migration `phase3_requirements_wbs`
      (`Requirement`, `RequirementRevision`, `RequirementEvidence`, `WBSNode`,
      `WBSVersion`)
- [x] Requisitos versionados (toda ediÃ§Ã£o gera revisÃ£o), transiÃ§Ã£o de status
      com mÃ¡quina de estados, vÃ­nculo com WBS, evidÃªncias (BR-008) e regra
      BR-015 para categoria COMPLIANCE
- [x] GeraÃ§Ã£o de DRP (Â§20) em `/api/v1/projects/[id]/drp` + pÃ¡gina
      `/projetos/[id]/requisitos` e visÃ£o global `/requisitos`
- [x] Ãrvore de WBS com numeraÃ§Ã£o automÃ¡tica, reordenaÃ§Ã£o, mover, duplicar,
      importaÃ§Ã£o (merge por cÃ³digo, preserva payload original) e exportaÃ§Ã£o
      JSON/CSV (`/projetos/[id]/wbs`)
- [x] Versionamento da Ã¡rvore (`WBSVersion`) com snapshots
- [x] Gate G1 passa a exigir DRP completo (Â§18-G1): todos os requisitos vivos
      com critÃ©rios de aceite + responsÃ¡vel e â‰¥1 evidÃªncia, com
      `REQUIREMENTS_INCOMPLETE` listando os bloqueios
- [x] 16 endpoints `/api/v1` (requisitos, evidÃªncias, revisÃµes, DRP, WBS,
      reorder, import/export, versÃµes, duplicar nÃ³)
- [x] Testes: 38 unit (motor de requisitos + motor WBS) + 29 de integraÃ§Ã£o
      (BR-008/BR-015, versionamento, G1, CRUD WBS, importaÃ§Ã£o/exportaÃ§Ã£o)

### Fase 4 â€” Planejamento e Custos (E07, E08), Documentos (E09) âœ…

**E07 Schedule âœ…** (ver DIARIO 08/10 â€” commits locais `phase4_schedule*`):

- [x] Modelos + migrations `phase4_schedule`, `phase4_schedule_baseline`,
      `phase5_schedule_import` (Activity, Dependency, Baseline,
      ScheduleTemplate, calendÃ¡rios)
- [x] Motor de CPM com ciclo/sindependÃªncia, marcos, resumos, crÃ­ticas;
      aplicaÃ§Ã£o de calendÃ¡rio (semana Ãºtil + feriados) e recÃ¡lculo de datas
- [x] Baseline com snapshot imutÃ¡vel + comparativo (pendente/atrasado/
      adiantado); `forecastFinish` persistido
- [x] Telas `/projetos/[id]/cronograma` (Ã¡rvore, dependÃªncias, crÃ­ticas,
      baseline) e visÃ£o Ãºnica `/cronograma` (item de menu habilitado)
- [x] ImportaÃ§Ã£o MS Project (CSV/XML) com validaÃ§Ã£o de grafo + replace-all,
      templates de cronograma reutilizÃ¡veis (`/templates`) e aplicaÃ§Ã£o de
      calendÃ¡rio ao cronograma (recalcula e audita)
- [x] Testes: 120 unit + 118 integraÃ§Ã£o totais do repositÃ³rio (schedule,
      baseline, calendÃ¡rios, import com fixtures MS Project)

**E08 Cost âœ…** â€” orÃ§amento de cozinha + Cost/EVM (14/10):

- [x] MÃ³dulo stateless `src/modules/budget` (premissas â†’ dimensionamento â†’
      quantitativos grupos 1â€“15 â†’ indiretos/reserva/BDI), memÃ³ria de cÃ¡lculo
      de `memoria_calculo.txt`, tabela de preÃ§os editÃ¡vel com defaults
      ilustrativos (fonte/data-base por PU)
- [x] `POST /api/v1/budget/estimate` (`COST:CREATE`, sem persistÃªncia) +
      tela `/orcamento` (assistente de 6 passos) + item "OrÃ§amento de
      cozinha" na sidebar; exportaÃ§Ã£o JSON/CSV como entrada da fase de
      orÃ§amentaÃ§Ã£o
- [x] Testes: +24 unit (`budget-engine`, `budget-export`)
- [x] Migration `phase6_cost` + mÃ³dulo `src/modules/cost` (itens,
      compromissos, realizados, EVM puro, baselines COST, import do
      `estimate` de `/orcamento` com replace-all) â€” 14/10 (noite)
- [x] API de cost sob `/projects/[id]/cost/` (itens/commitments/actuals/
      baselines/evm/import-estimate/summary) com audit + domain events
- [x] Gate G4: `COST_BASELINE_REQUIRED` (409) bloqueia aprovaÃ§Ã£o quando hÃ¡
      itens de custo vivos sem baseline COST aprovada
- [x] UI: `/projetos/[id]/custos` (EVM + CRUD + import) e `/custos`
      (vis portfolio); item "Custos" na sidebar
- [x] Testes: +12 unit (`cost-engine`); `tests/integration/cost.test.ts`
       executado em 15/10 sob consentimento (24 testes verdes â€” 2 bugs
       corrigidos: cÃ³digo `CC001` consumido por teste anterior e
       `import-estimate` fazia soft delete violando o Ã­ndice Ãºnico
       `(projectId, code)`, agora hard delete igual ao import de schedule)

**E09 Documents âœ…** â€” documentos do projeto (15/10):

- [x] Migration `phase7_documents` + modelos `Document`, `DocumentRevision`
      (conteÃºdo bytea + SHA-256, append-only), `DocumentApproval`,
      `DocumentLink` + enum `DocumentStatus`
- [x] MÃ³dulo `src/modules/documents`: mÃ¡quina de estados pura
      (SUBMIT/APPROVE/REJECT/RELEASE/OBSOLETE), BR-009 (revisÃµes imutÃ¡veis
      sÃ³ a partir de APPROVED+, metadados editÃ¡veis sÃ³ em WIP/FOR_REVIEW),
      BR-010 (nÃ£o apaga aprovado/liberado), BR-011 (audit + approval),
      storage com allowlist MIME e limite 4 MB (bytea â€” limite de body do Vercel)
- [x] API: upload multipart, CRUD de metadados, revisÃµes, transiÃ§Ãµes de
      status por permissÃ£o (EDIT/APPROVE/REJECT), download por revisÃ£o com
      audit DOWNLOAD, links genÃ©ricos (REQUIREMENT/WBS/SCHEDULE/COST/DOCUMENT)
- [x] UI: `/documentos` (visÃ£o global), `/projetos/[id]/documentos`
      (CRUD + transiÃ§Ãµes + revisÃµes + links), item "Documentos" na sidebar
- [x] Testes: +10 unit (`documents-engine`) + 21 integraÃ§Ã£o
      (`documents.test.ts`: upload/cÃ³digo automÃ¡tico, mÃ¡quina de estados,
      BR-009/010/011, links, download, isolamento de tenant)

### Fase 5+ â€” Releases 1â†’4 â¬œ

Executar Ã©picos E10â€“E18 conforme prioridade de Release 1, depois Releases 2â€“4.

## CritÃ©rios de aceite do MVP (Â§101)

O MVP Ã© aceito quando um projeto real executar o ciclo completo:

```text
Oportunidade â†’ Requisitos â†’ OrÃ§amento â†’ Projeto â†’ Baseline â†’ ExecuÃ§Ã£o â†’
AvanÃ§o â†’ Custo â†’ Risco â†’ MudanÃ§a â†’ Qualidade â†’ Comissionamento â†’
Aceite â†’ Encerramento
```

AlÃ©m disso: mÃºltiplos projetos, permissÃµes, histÃ³rico, origem de indicadores,
exportaÃ§Ã£o, backup, auditoria e isolamento de tenants.

CenÃ¡rio E2E automatizado: Â§102 (34 passos, de "criar tenant" a "aprovar G8").

## Gates do projeto de implantaÃ§Ã£o (referÃªncia)

G0 Oportunidade qualificada Â· G1 Requisitos suficientes Â· G2 Viabilidade Â·
G3 Proposta/orÃ§amento Â· G4 Contrato e plano Â· G5 Projeto liberado Â·
G6 Pronto para comissionamento Â· G7 Aceite operacional Â· G8 Encerramento


## Backlog de melhorias (pos-roadmap)

| # | Item | Escopo |
|---|---|---|
| B01 | Testes de integracao E15 | ✅ Concluido (commissioning.test.ts) |
| B02 | Testes de integracao E16 | ✅ Concluido (sustainability.test.ts) |
| B03 | Testes de integracao E17/E19 | ✅ Concluido (dashboard.test.ts) |
| B04 | Testes de integracao E18 | ✅ Concluido (ai.test.ts) |
| B05 | Creditos OpenAI / OpenCode Go | ✅ Concluido (status endpoint + UI) |
| B06 | Ollama local (dev) | Documentar setup para desenvolvimento local |
| B07 | Melhorias de UI | Dialogs de edicao, filtros, exportacao CSV nos modulos novos |
