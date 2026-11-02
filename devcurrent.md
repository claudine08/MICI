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

**Ultima atualizacao:** 02/11/2026 (E19 Dashboard Fatia 1+2+3 implementadas: portfólio + drill-down com gráficos visuais (Recharts: curva S, burndown, heat map). Build/lint verdes. Proxima frente: E15 Commissioning (a cargo do usuario).)

---

## 1. Estado atual (resumo de 1 linha)

| E19 Project Dashboard | Portfolio + drill-down: datas, custos, percentuais as-of, KPIs, curva S, Gantt, burndown, heat map de riscos, alertas (Fatia 1+2+3 implementadas (graficos visuais com Recharts)) |

## 2. Ambiente e comandos (nÃ£o precisa rediscover)

| Item | Valor |
|---|---|
| Repo | `https://github.com/claudine08/MICI.git`, branch `main` |
| ProduÃ§Ã£o | Vercel `mici-theta.vercel.app` (projeto `mici`, team `team_wbWA52Y5iAGD3NRZNIrNEMAe`, CLI logada como `ccpjr8-1922`) |
| Banco prod | Neon `ep-lively-firefly-b7d3dgk3-poolerâ€¦/neondb` â€” URL em `.env.local` (puxada do Vercel; **nunca commitar**) |
| Migrations | 19 aplicadas no Neon (`init_foundation_identity` â†’ `phase17_cost_tracking`) |
| Banco local | PostgreSQL 17 portÃ¡til em `%LOCALAPPDATA%\PostgreSQL17-data`; **sobe via tarefa agendada `mici-postgres`** (settings corrigidas 29/10: `AllowStartIfOnBatteries=True`; start via shell direto morre com `0xC0000142`) |
| Dev local | `npm run dev` â†’ `http://localhost:3000`; seed demo: 5 usuÃ¡rios, login `admin@mici.demo` / `Demo@1234` |
| `.env*` | `DATABASE_URL` local usa `127.0.0.1` (Prisma nÃ£o conecta em `localhost`/IPv6 nesta mÃ¡quina). `prisma7.config.ts` carrega `.env` via dotenv (nÃ£o `.env.local`) |
| Testes | `npm test` (unit/Vitest 5) Â· `MICI_TEST_NO_RESET=1 npm run test:integration` (global-setup pula `--force-reset`; banco `mici_test` jÃ¡ sincronizado via `prisma db push`) â€” Ãºltima execuÃ§Ã£o conhecida: 251 unit / 17 arquivos + 267 integraÃ§Ã£o / 14 arquivos (antes da Fatia 2 de procurement) |
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
| E15 Commissioning | Plano, teste, reteste, aceite |
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
- Qualidade (E13): `src/modules/quality/*` (inclui `punch-items.ts`) Â· `qualidade.md` Â· testes `tests/{unit/quality-engine,integration/quality}.test.ts`.
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

- Upload de arquivo OneDrive online-only falha no browser (copiar local antes; mensagem do MICI jÃ¡ orienta).
- `vercel --prod` deploya o diretÃ³rio local (nÃ£o sÃ³ o push) â€” working tree limpa antes.
- PS 5.1 nÃ£o tem `-SkipHttpErrorCheck` (usar try/catch em smoke scripts).
- `Get-ChildItem` trata `[id]` como curinga â€” usar `-LiteralPath`.
- `q.sql` untracked na raiz â€” verificar se deve ser commitado ou removido.
- PO/recebimento (Fatia 2) agora cobertos por `tests/integration/procurement-orders.test.ts` (17 casos: criaÃ§Ã£o, idempotÃªncia, validaÃ§Ãµes de estado, ediÃ§Ã£o, transiÃ§Ãµes, exclusÃ£o, recebimento parcial/total, isolamento). Testes unitÃ¡rios do engine de PO/recebimento ainda nÃ£o existem (lacuna opcional).
