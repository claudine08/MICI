# DEVCURRENT â€” ponto de retomada do desenvolvimento

> **Arquivo vivo de estado â€” fonte oficial de retomada do desenvolvimento**
> (decisÃ£o de 29/10/2026). Objetivo: retomar sem reler DIARIO/ROADMAP
> inteiros. **Atualize este arquivo a cada sessÃ£o relevante** (fim de fase,
> deploy, mudanÃ§a de ambiente, novo backlog). `DIARIO.md` (histÃ³rico
> cronolÃ³gico) e `ROADMAP.md` (status de Ã©picos) continuam sendo atualizados
> por sessÃ£o, mas apenas para consulta histÃ³rica â€” nÃ£o sÃ£o mais a fonte de
> retomada. Profundidade de um mÃ³dulo: `qualidade.md`, `suprimentos.md` etc.
> **RAG leve**: detalhes de uma seÃ§Ã£o estÃ£o indexados em `docs/rag-index.md`
> (gerado por `npm run rag:index`); use `npm run rag:query <termo>` para
> recuperar sÃ³ o chunk relevante e reduzir tokens.

**Ultima atualizacao:** 07/11/2026 (b). Frente **Fase I3 (Integrações)** — lacunas
do §10 entregues, **commitadas, com push e EM PRODUÇÃO** (deploy smoke OK): UI
`/administracao/integracoes`, telefone (`User.phone` gravado pelo admin em
`/administracao/usuarios` + autoatualização via `PATCH /api/v1/me`), `vercel.json`
com os 3 crons diários (GET+POST nas rotas), `CRON_SECRET` setado no Vercel
(Production), migration `phase24_user_phone` **aplicada no Neon**. Gate final:
lint · typecheck · 291 unit · **356 integração / 26 arquivos** · build. Depois do
smoke em produção veio o **fix do reconvite** (500 em `POST /api/v1/members` ao
reconvidar membro removido — `inviteMember` reativa a membresia soft-deleteada;
commits `7ecf0e4` + `253e5b2`, deploy `EmAeUDUKzjv3TexrbJVxowsgxMjg`, re-testado
201/409). Detalhes na **seção 10**. Antes: 06/11 —
isolamento de falhas + fila `job_queue` + WhatsApp outbound + outbox com
consumidor único prontos (gate verde); 05/11 — Onda 1 concluída (webhooks
outbound phase21 + aprovação por e-mail phase22 + UI /aprovacoes/[token] + testes
+ 1.4 limpeza + 1.6 observabilidade + 1.7 backup Neon + 1.3 Playwright. Smoke OK).

---

## 1. Estado atual (resumo de 1 linha)

| E19 Project Dashboard | Portfolio + drill-down: datas, custos, percentuais as-of, KPIs, curva S, Gantt, burndown, heat map de riscos, alertas (Fatia 1+2+3 implementadas (graficos visuais com Recharts)) |

## 2. Ambiente e comandos (nÃ£o precisa rediscover)

| Item | Valor |
|---|---|
| Repo | `https://github.com/claudine08/MICI.git`, branch `main` |
| ProduÃ§Ã£o | Vercel `mici-theta.vercel.app` (projeto `mici`, team `team_wbWA52Y5iAGD3NRZNIrNEMAe`, CLI logada como `ccpjr8-1922`) |
| Banco prod | Neon `ep-lively-firefly-b7d3dgk3-poolerâ€¦/neondb` â€” URL em `.env.local` (puxada do Vercel; **nunca commitar**) |
| Migrations | 26 aplicadas no Neon (`init_foundation_identity` â†’ `phase24_user_phone`, 07/11) |
| Banco local | PostgreSQL 17 portÃ¡til em `%LOCALAPPDATA%\PostgreSQL17-data`; **sobe via tarefa agendada `mici-postgres`** (settings corrigidas 29/10: `AllowStartIfOnBatteries=True`; start via shell direto morre com `0xC0000142`) |
| Dev local | `npm run dev` â†’ `http://localhost:3000`; seed demo: 5 usuÃ¡rios, login `admin@mici.demo` / `Demo@1234` |
| `.env*` | `DATABASE_URL` local usa `127.0.0.1` (Prisma nÃ£o conecta em `localhost`/IPv6 nesta mÃ¡quina). `prisma7.config.ts` carrega `.env` via dotenv (nÃ£o `.env.local`) |
| Testes | `npm test` (unit/Vitest 5) Â· `MICI_TEST_NO_RESET=1 npm run test:integration` (global-setup pula `--force-reset`; banco `mici_test` jÃ¡ sincronizado via `prisma db push`) â€” Ãºltima execuÃ§Ã£o conhecida: **291 unit / 21 arquivos + 356 integraÃ§Ã£o / 26 arquivos** (07/11, `--maxWorkers 1`) |
| Gate padrÃ£o entre fases | `npm run lint` Â· `npm run typecheck` Â· `npm test` Â· `MICI_TEST_NO_RESET=1 npm run test:integration` Â· `npm run build` â€” tudo verde antes de commitar |
| Deploy (fluxo fixo) | 1) commit `feat:` + push â†’ 2) `prisma migrate deploy` com `DATABASE_URL` do `.env.local` (setar env antes; dotenv nÃ£o sobrescreve) â†’ 3) `npx vercel --prod` â†’ 4) smoke autenticado â†’ 5) commit `docs:` (DIARIO+ROADMAP+md do mÃ³dulo) + push |
| Smoke autenticado | POST `/api/auth/csrf` â†’ POST `/api/auth/callback/credentials` (email/password/csrfToken, `json=true`, seguir 302) â†’ bater nas rotas com a WebSession; sem sessÃ£o deve dar 401 |
| Prisma 7 | `migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script`; comandos destrutivos exigem consentimento (`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` â€” autorizado sÃ³ para reset do `mici_test`) |
| Next.js 16 | **Tem breaking changes** â€” ler `node_modules/next/dist/docs/` antes de escrever cÃ³digo (bloco em `AGENTS.md` Ã© reescrito pelo `next dev`, manter) |
| RAG (docs) | `npm run rag:index` regenera `docs/rag-index.{json,md}` Â· `npm run rag:query <termo>` recupera chunks relevantes |

## 3. ConvenÃ§Ãµes do repo (seguir Ã  risca)

- **Commits**: sÃ³ quando o usuÃ¡rio pedir. PadrÃ£o: `feat: <Ã¡rea> - <resumo> - E<NN> US<NN>` (ASCII, sem acento) e depois `docs: registra â€¦`. `main` direto, sem PR.
- **Arquitetura por mÃ³dulo**: `src/modules/<area>/` com `engine.ts` (mÃ¡quina de estados puro + helpers), `schemas.ts` (zod), `selectors.ts` (linhas p/ UI + includes Prisma), `common.ts` (cÃ³digos sequenciais `PREFIX001`), writer (ex.: `punch-items.ts`) com audit + domain events + idempotÃªncia `clientUuid`.
- **API**: `src/app/api/v1/projects/[id]/<area>/â€¦` â€” auth (Auth.js), `assertMember`, permissÃµes por mÃ³dulo (`QUALITY:VIEW/CREATE/EDIT/DELETE`, `FIELD:*` etc.), erro padronizado `{error:{code,message,correlation_id}}`.
- **UI**: server component na pÃ¡gina (`src/app/(app)/projetos/[id]/â€¦/page.tsx`) carrega via `list*` do selector; cliente Ã© `src/components/<area>/<area>-view.tsx` (tabs + diÃ¡logos shadcn/RHF/zod).
- **Testes**: unit puro no engine; integraÃ§Ã£o com seed + tenant isolation; idempotÃªncia testada com `clientUuid` repetido.
- **Docs de fase**: entrada no `DIARIO.md` (append), status no `ROADMAP.md` (tabela), doc do mÃ³dulo (`qualidade.md`, `campo.md`, `suprimentos.md`â€¦) e este `devcurrent.md`.
- **RAG**: para detalhes de uma seÃ§Ã£o, prefira `npm run rag:query <termo>` em vez de ler `DIARIO.md`/`ROADMAP.md` inteiros.

## 4. Backlog E12: PWA/fila offline completa â€” âœ… FECHADO (29/10)

Contexto e implementaÃ§Ã£o detalhada em `docs/rag-index.md` (chunks `diario-*` e
`devcurrent-*`) e no DIARIO 29/10. Resumo: PWA (manifest + SW) + fila offline
IndexedDB (creates, fotos com Blob, PATCH editÃ¡veis) + sync FIFO + banner de
status + regra de conflito. Sem migration. Em produÃ§Ã£o: commits `116bd7a`,
`dec1951`. Playwright fora (sem infra e2e).

## 5. E08+ Cost Tracking & Cash Flow â€” âœ… IMPLEMENTADO (01/11)

ExtensÃ£o do mÃ³dulo de Custos (E08) + integraÃ§Ã£o com Procurement (E14) +
Schedule (E07):

- **Rastreio por WBS/atividade**: `CostItem`, `CostCommitment` e `CostActual`
  agora carregam `wbsNodeId` e `activityId` (FKs). CostCommitment referencia
  `purchaseOrderId`; CostActual referencia `goodsReceiptId`.
- **IntegraÃ§Ã£o automÃ¡tica Procurement â†’ Cost**:
  - PO emitido (ISSUED) â†’ cria `CostCommitment` vinculado (idempotente por PO).
  - Recebimento confirmado â†’ cria `CostActual` vinculado (idempotente por GR).
- **Fluxo de caixa CSV**: rotas
  `GET/POST /api/v1/projects/[id]/cost/cashflow/{export,import}` â€” exporta
  planejado/comprometido/realizado; importa custos indiretos (categoria
  INDIRETO/OUTROS) como CostItem com WBS/atividade nulos.
- Migration: `phase17_cost_tracking` (aplicada local; produÃ§Ã£o via
  `prisma migrate deploy`).
- Migration pendente em produÃ§Ã£o: aplicar `phase17_cost_tracking` no Neon.

## 6. E14 Procurement â€” âœ… COMPLETO (Fatia 1 + Fatia 2)

- **Fatia 1** (produÃ§Ã£o 30/10): fornecedores (SP), requisiÃ§Ãµes (PR), cotaÃ§Ãµes
  (QT) e mapa comparativo (BC). Commit `2ea90bb`, migration `phase15_procurement`,
  deploy `mici-5w7tzxsmi-homeland1`.
- **Fatia 2** (produÃ§Ã£o): PO (`PO001`) + recebimento (`GR001`), com rotas
  `procurement/orders`, `procurement/receipts`, migration `phase16_procurement`.
  Commits `e4555bb` â€¦ `9e5c259`. Detalhes: `suprimentos.md` (seÃ§Ãµes 5â€“7).
- PrÃ³ximo: **E15 Commissioning** (a cargo do usuÃ¡rio).

## 6. Restante do roadmap (apÃ³s E14)

| Ã‰pico | Escopo curto |
|---|---|
| E19 Project Dashboard | Portfolio + drill-down: datas, custos, percentuais as-of, KPIs, curva S, Gantt, burndown, heat map de riscos, alertas (Fatia 1+2+3 implementadas (graficos visuais com Recharts)) |
| E15 Commissioning | Plano, teste, reteste, aceite — ✅ implementado (local, pendente deploy) |
| E16 Sustainability | PSP, baseline, metas, mediÃ§Ãµes, resÃ­duo, relatÃ³rio |
| E17 Dashboard | PortfÃ³lio, executivo, projeto, campo (genÃ©rico) |
| E18 AI | AI Gateway, prompts, extraÃ§Ã£o, resumo diÃ¡rio, classificaÃ§Ã£o, busca |

| Ã‰pico | Escopo curto |
|---|---|
| E16 Sustainability | PSP, baseline, metas, mediÃ§Ãµes, resÃ­duo, relatÃ³rio |
| E17 Dashboard | PortfÃ³lio, executivo, projeto, campo |
| E18 AI | AI Gateway, prompts, extraÃ§Ã£o, resumo diÃ¡rio, classificaÃ§Ã£o, busca semÃ¢ntica (inclui RAG/embeddings do produto) |

## 7. Ponteiros rÃ¡pidos de cÃ³digo

- Procurement (E14): `src/modules/procurement/*`
- Cost tracking & cash flow (E08+): `src/modules/cost/cashflow.ts` Â· rotas `api/v1/projects/[id]/cost/cashflow/{export,import}` Â· mÃ³dulos `cost/{items,commitments,actuals}.ts` (WBS/atividade/PO/GR) Â· doc `custos.md`. Â· rotas `api/v1/projects/[id]/procurement/*` e `api/v1/suppliers/*` Â· UI `src/components/procurement/*` e `src/app/(app)/suprimentos` e `src/app/(app)/projetos/[id]/suprimentos` Â· doc `suprimentos.md` Â· testes `tests/{unit/procurement-engine,integration/procurement}.test.ts`.
- Campo (E12/backlog): `src/modules/field/*` Â· rotas `api/v1/projects/[id]/field/*` Â· UI `src/components/field/field-view.tsx` Â· fila offline `src/lib/offline-queue.ts` + `public/sw.js` + `src/app/manifest.ts` Â· testes `tests/{unit/offline-queue,unit/field-engine,integration/field}.test.ts`.
- Qualidade (E13): `src/modules/quality/*` (inclui `punch-items.ts`)
- Comissionamento (E15): `src/modules/commissioning/*` · `comissionamento.md` · rotas `api/v1/projects/[id]/commissioning/*` · UI `src/components/commissioning/commissioning-view.tsx` e `src/app/(app)/projetos/[id]/commissioning`.
- Sustentabilidade (E16): `src/modules/sustainability/*` · `sustentabilidade.md` · rotas `api/v1/projects/[id]/sustainability/*` · UI `src/components/sustainability/sustainability-view.tsx` e `src/app/(app)/projetos/[id]/sustentabilidade`.
- IA (E18): `src/modules/ai/*` · rotas `api/v1/ai/run`, `api/v1/ai/requests` · UI `/ai`. Requer `OPENAI_API_KEY` para respostas reais (mock sem chave). Â· `qualidade.md` Â· testes `tests/{unit/quality-engine,integration/quality}.test.ts`.
- Auth/permissÃµes: `src/lib/auth.ts` Â· guards nas rotas Â· seed em `prisma/seed.ts`.
- Schema completo: `prisma/schema.prisma` (~2500 linhas).
- RAG de docs: `scripts/rag-index.mjs`, `scripts/rag-query.mjs`, `docs/rag-index.{json,md}`.

## 8. RAG â€” Ã­ndice de chunks (auto-gerado)

- Ãndice completo: `docs/rag-index.md` (178 chunks em 6 arquivos) e
  `docs/rag-index.json` (com line ranges).
- Regenerar apÃ³s editar docs: `npm run rag:index`.
- Recuperar sÃ³ o necessÃ¡rio: `npm run rag:query <termo>` (ex.:
  `npm run rag:query procurement PO recebimento`).
- ConvenÃ§Ã£o: ao precisar de detalhe de uma fase, consultar o chunk em vez de
  ler `DIARIO.md`/`ROADMAP.md` inteiros.

## 9. Riscos conhecidos

- **Pós-03/11: testes de integração nesta máquina exigem `--maxWorkers 1`** —
  com 20 arquivos/332 testes paralelos o Postgres local (disco lento + OneDrive/AV)
  trava o postmaster (`LISTENING` + `CLOSE_WAIT`, `pg_isready` sem resposta);
  também ocorre `P1001` intermitente no `db push` do global-setup. Recuperar com
  `pg_ctl stop -m immediate` + tarefa agendada `mici-postgres` e rodar a suíte
  serializada. 20 papéis do sistema (incl. `SUPER_USER`) existem por organização —
  papéis de novas versões: rodar `scripts/ensure-system-roles.ts`.
- **Vercel CLI sem `--team homeland1` retorna "Not authorized"** no deploy —
  usar `npx vercel --prod --team homeland1`.

- Upload de arquivo OneDrive online-only falha no browser (copiar local antes; mensagem do MICI jÃ¡ orienta).
- **Reconvite apÃ³s remoÃ§Ã£o (07/11):** `inviteMember` reativa membresa soft-deleteada
  (unique `org+user` impedia novo `create` e dava **500**); regressão em
  `tests/integration/member-reinvite.test.ts`.
- `vercel --prod` deploya o diretÃ³rio local (nÃ£o sÃ³ o push) â€” working tree limpa antes.
- PS 5.1 nÃ£o tem `-SkipHttpErrorCheck` (usar try/catch em smoke scripts).
- `Get-ChildItem` trata `[id]` como curinga â€” usar `-LiteralPath`.
- `q.sql` untracked na raiz â€” verificar se deve ser commitado ou removido.
- PO/recebimento (Fatia 2) agora cobertos por `tests/integration/procurement-orders.test.ts` (17 casos: criaÃ§Ã£o, idempotÃªncia, validaÃ§Ãµes de estado, ediÃ§Ã£o, transiÃ§Ãµes, exclusÃ£o, recebimento parcial/total, isolamento). Testes unitÃ¡rios do engine de PO/recebimento ainda nÃ£o existem (lacuna opcional).

## 10. Módulo de Integrações — estado de retomada (07/11)

> Ponto de retomada da frente **Fase I3** (`INTEGRATIONS_MODULE.md` na raiz do
> projeto). Lacunas 1–4 abaixo **entregues, commitadas (`149f2c9` feat +
> `24c4b5c` docs), com push e em produção** (smoke OK 07/11); fix de reconvite
> (`7ecf0e4` + `253e5b2`) publicado em seguida. Próximos passos ao final.

**Feito (05–06/11):**

- **Isolamento de falhas** `src/modules/integrations/isolation.ts`: kill switch
  por env (`INTEGRATIONS_ENABLED` + `EMAIL_ENABLED`/`WHATSAPP_ENABLED`/`WEBHOOKS_ENABLED`),
  circuit breaker em memória por chave, `safeCall` com timeout + race (nunca lança).
- **Fila de jobs** `src/modules/integrations/jobs.ts` sobre `job_queue` (ADR-015):
  `enqueueJob` idempotente (dedupeKey), reivindicação atômica, backoff exponencial,
  `skipped` (circuito/desligado) NÃO conta tentativa, `runJobNow` inline best-effort.
  Handlers: `email.send`, `whatsapp.send`, `whatsapp.notify`.
- **Notificação WhatsApp** `notifications.ts` (fan-out de `domain_events` para
  membros ACTIVE com `User.phone`) + `whatsapp.ts` (Meta Cloud API, template).
- **Dispatcher virou consumidor único do outbox**: `dispatchPendingEvents`
  (renomeado de `dispatchPendingWebhooks`) reivindica o evento (PENDING→PROCESSED)
  e faz fan-out webhook + job `whatsapp.notify`; **correção de segurança**: antes,
  eventos sem `organizationId` vazavam para endpoints de qualquer tenant.
- **Aprovação por e-mail desacoplada**: `createApprovalRequest` enfileira
  `email.send` (dedupe `email.approval:<id>`) em vez de chamar o provedor síncrono.
- **Crons**: `/api/v1/cron/webhooks` agora processa outbox + fila; nova rota
  `/api/v1/cron/notifications` (mesmo `CRON_SECRET`).
- **Migration** `20261105020000_phase24_user_phone` (`users.phone`).
- **Testes novos**: `tests/unit/integration-isolation.test.ts`,
  `tests/integration/integration-isolation.test.ts`,
  `tests/integration/webhooks.test.ts`.

**Gate (07/11):** lint 0 erros (warnings preexistentes) · typecheck OK ·
**291 unit / 21 arquivos** · **354 integração / 25 arquivos** (`MICI_TEST_NO_RESET=1 --maxWorkers 1`)
· **build OK**. (Gate anterior 06/11: 285 unit / 348 integração.)

**Pegadinha do build:** `scripts/tmp-debug.ts` (arquivo temporário do git
status) sumiu do disco, mas ficava referenciado no cache incremental —
`error TS6053 ... not found` derrubava o `next build`. Correção: apagar
`tsconfig.tsbuildinfo` e rebuildar (gerado de novo).

**Nota:** a 1ª tentativa de integração falhou com `P1001` (Postgres subiu junto
com o teste). Subir com `schtasks /run /tn mici-postgres` e confirmar
`%LOCALAPPDATA%\Programs\PostgreSQL17\bin\pg_isready.exe -h 127.0.0.1`
**antes** de rodar a suíte, e sempre `--maxWorkers 1`.

**Entregue em 07/11 (lacunas 1–4 fechadas):**

1. **UI de Integrações** — nova página `/administracao/integracoes`
   (guard `INTEGRATION:VIEW`, item de nav "Integrações"): cards dos provedores
   (kill switches via `isProviderEnabled` + presença de credenciais), painel de
   webhooks (`src/components/integrations/webhooks-panel.tsx` — CRUD + teste +
   últimas entregas + estado do circuit breaker por endpoint), fila `job_queue`
   + outbox `domain_events` e tabela dos agendamentos. Endpoint secret nunca
   vai ao client.
2. **Cadastro de telefone (E.164)** — admin: coluna/campo em
   `/administracao/usuarios` (estende `updateMemberSchema` com `phone`, grava
   `User.phone`, expõe em `MemberRow`). Autoatualização: **`PATCH /api/v1/me`**
   (`updateMyPhoneSchema`) sem exigir `USER:EDIT` — o próprio usuário grava só
   o telefone (UI de self-service fica para depois).
3. **Crons no Vercel** — criado `vercel.json` (3 crons diários: webhooks 03h
   UTC, backup 04h UTC, notificações 15h UTC; Hobby = 1x/dia por cron). As 3
   rotas `api/v1/cron/*` agora aceitam **GET** (o Vercel envia GET com
   `Authorization: Bearer $CRON_SECRET`) mantendo POST manual. **`CRON_SECRET`
   gerado e setado** como Secret de Production via
   `npx vercel env add CRON_SECRET production --scope homeland1` (antes as rotas
   pulavam autenticação). **`NEON_API_KEY` continua ausente** no Vercel: o cron
   de backup responde "Config ausente" até a chave ser criada no console Neon.
4. **Gate + migration + docs** — gate final verde (291 unit / 21 arquivos +
   **356 integração / 26 arquivos**; testes novos:
   `tests/unit/identity-schemas.test.ts`,
   `tests/integration/member-phone.test.ts`, `tests/integration/cron-routes.test.ts`,
   `tests/integration/member-reinvite.test.ts`);
   `phase24_user_phone` **aplicada no Neon** (26ª de 26) com
   `dotenv -e .env.vercel.tmp -- prisma migrate deploy`.

**Publicado em 07/11 (produção OK):**

- Commits `149f2c9` feat + `24c4b5c` docs → push → deploy `mici-jtr7kalvj` →
  smoke: `/administracao/integracoes` 200, `/administracao/usuarios` 200,
  `PATCH /api/v1/me` 200/200/422, webhooks 200/201/200, cron sem Bearer 403,
  `vercel crons list` com os 3 crons (03h/04h/15h UTC).
- **Fix pós-smoke:** usuário reportou 500 em `POST /api/v1/members` —
  reconvite de membro removido batia na unique `(org,user)`. `inviteMember`
  agora **reativa** a membresia soft-deleteada (`src/modules/identity/members.ts`),
  duplicado de ativo continua 409; regressão em
  `tests/integration/member-reinvite.test.ts`. Commits `7ecf0e4` + `253e5b2`,
  deploy `EmAeUDUKzjv3TexrbJVxowsgxMjg`, re-testado em produção
  (criar 201 → remover 200 → reconvite 201 → duplicado 409 → limpeza 200).

**Próximos passos (retomada 08/11):** 1) criar **`NEON_API_KEY`** no console
Neon e adicionar ao Vercel (hoje o cron de backup 04h UTC responde "Config
ausente"; `NEON_PROJECT_ID` já existe) → 2) conferir a 1ª execução dos crons:
`npx vercel logs mici-theta.vercel.app --scope homeland1` (03h webhooks, 04h
backup, 15h notificações UTC) → 3) decidir destino de `Integrations/` +
`README_MICI_Comunicacao.md` (untracked, spec de referência, fora do commit) →
4) UI de self-service de telefone — entregue: página `/perfil` + `src/components/profile/profile-view.tsx` (E.164, salva via `PATCH /api/v1/me`), nav "Meu perfil". Backlog restante Fase I3: inbound WhatsApp e adapters ERP.
Backlog restante da Fase I3: inbound WhatsApp e adapters ERP.

**Ponteiros:** `src/modules/integrations/{isolation,jobs,notifications,whatsapp,webhooks,approvals,email}.ts`
· rotas `api/v1/cron/{webhooks,notifications,backup}` (GET+POST) · `vercel.json`
· `api/v1/organizations/[orgId]/webhooks*` · `PATCH /api/v1/me` (telefone) ·
UI: `src/app/(app)/administracao/integracoes/page.tsx` +
`src/components/integrations/webhooks-panel.tsx` +
`src/components/integrations/approval-view.tsx`
· especificação de referência (arquitetura Django/n8n, **não** copiar):
`mici/Integrations/*.md`.
