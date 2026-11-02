# DEVCURRENT — ponto de retomada do desenvolvimento

> **Arquivo vivo de estado — fonte oficial de retomada do desenvolvimento**
> (decisão de 29/10/2026). Objetivo: retomar sem reler DIARIO/ROADMAP
> inteiros. **Atualize este arquivo a cada sessão relevante** (fim de fase,
> deploy, mudança de ambiente, novo backlog). `DIARIO.md` (histórico
> cronológico) e `ROADMAP.md` (status de épicos) continuam sendo atualizados
> por sessão, mas apenas para consulta histórica — não são mais a fonte de
> retomada. Profundidade de um módulo: `qualidade.md`, `suprimentos.md` etc.
> **RAG leve**: detalhes de uma seção estão indexados em `docs/rag-index.md`
> (gerado por `npm run rag:index`); use `npm run rag:query <termo>` para
> recuperar só o chunk relevante e reduzir tokens.

**Última atualização:** 02/11/2026 (E08+ Cost Tracking & Cash Flow em
produção: migration `phase17_cost_tracking` aplicada no Neon (19 migrations),
deploy `mici-c6kzjgsfv-homeland1`, smoke verde — health/projects/cashflow
export 200, sem sessão 401. Próxima frente: **E15 Commissioning**.)

---

## 1. Estado atual (resumo de 1 linha)

E01–E14 completos e em produção (E14 agora com PO + recebimento). **Próxima
frente: E15 Commissioning** (plano, teste, reteste, aceite). Working tree
com `q.sql` untracked; `main` pushada até `9e5c259`.

## 2. Ambiente e comandos (não precisa rediscover)

| Item | Valor |
|---|---|
| Repo | `https://github.com/claudine08/MICI.git`, branch `main` |
| Produção | Vercel `mici-theta.vercel.app` (projeto `mici`, team `team_wbWA52Y5iAGD3NRZNIrNEMAe`, CLI logada como `ccpjr8-1922`) |
| Banco prod | Neon `ep-lively-firefly-b7d3dgk3-pooler…/neondb` — URL em `.env.local` (puxada do Vercel; **nunca commitar**) |
| Migrations | 19 aplicadas no Neon (`init_foundation_identity` → `phase17_cost_tracking`) |
| Banco local | PostgreSQL 17 portátil em `%LOCALAPPDATA%\PostgreSQL17-data`; **sobe via tarefa agendada `mici-postgres`** (settings corrigidas 29/10: `AllowStartIfOnBatteries=True`; start via shell direto morre com `0xC0000142`) |
| Dev local | `npm run dev` → `http://localhost:3000`; seed demo: 5 usuários, login `admin@mici.demo` / `Demo@1234` |
| `.env*` | `DATABASE_URL` local usa `127.0.0.1` (Prisma não conecta em `localhost`/IPv6 nesta máquina). `prisma7.config.ts` carrega `.env` via dotenv (não `.env.local`) |
| Testes | `npm test` (unit/Vitest 5) · `MICI_TEST_NO_RESET=1 npm run test:integration` (global-setup pula `--force-reset`; banco `mici_test` já sincronizado via `prisma db push`) — última execução conhecida: 251 unit / 17 arquivos + 267 integração / 14 arquivos (antes da Fatia 2 de procurement) |
| Gate padrão entre fases | `npm run lint` · `npm run typecheck` · `npm test` · `MICI_TEST_NO_RESET=1 npm run test:integration` · `npm run build` — tudo verde antes de commitar |
| Deploy (fluxo fixo) | 1) commit `feat:` + push → 2) `prisma migrate deploy` com `DATABASE_URL` do `.env.local` (setar env antes; dotenv não sobrescreve) → 3) `npx vercel --prod` → 4) smoke autenticado → 5) commit `docs:` (DIARIO+ROADMAP+md do módulo) + push |
| Smoke autenticado | POST `/api/auth/csrf` → POST `/api/auth/callback/credentials` (email/password/csrfToken, `json=true`, seguir 302) → bater nas rotas com a WebSession; sem sessão deve dar 401 |
| Prisma 7 | `migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script`; comandos destrutivos exigem consentimento (`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` — autorizado só para reset do `mici_test`) |
| Next.js 16 | **Tem breaking changes** — ler `node_modules/next/dist/docs/` antes de escrever código (bloco em `AGENTS.md` é reescrito pelo `next dev`, manter) |
| RAG (docs) | `npm run rag:index` regenera `docs/rag-index.{json,md}` · `npm run rag:query <termo>` recupera chunks relevantes |

## 3. Convenções do repo (seguir à risca)

- **Commits**: só quando o usuário pedir. Padrão: `feat: <área> - <resumo> - E<NN> US<NN>` (ASCII, sem acento) e depois `docs: registra …`. `main` direto, sem PR.
- **Arquitetura por módulo**: `src/modules/<area>/` com `engine.ts` (máquina de estados puro + helpers), `schemas.ts` (zod), `selectors.ts` (linhas p/ UI + includes Prisma), `common.ts` (códigos sequenciais `PREFIX001`), writer (ex.: `punch-items.ts`) com audit + domain events + idempotência `clientUuid`.
- **API**: `src/app/api/v1/projects/[id]/<area>/…` — auth (Auth.js), `assertMember`, permissões por módulo (`QUALITY:VIEW/CREATE/EDIT/DELETE`, `FIELD:*` etc.), erro padronizado `{error:{code,message,correlation_id}}`.
- **UI**: server component na página (`src/app/(app)/projetos/[id]/…/page.tsx`) carrega via `list*` do selector; cliente é `src/components/<area>/<area>-view.tsx` (tabs + diálogos shadcn/RHF/zod).
- **Testes**: unit puro no engine; integração com seed + tenant isolation; idempotência testada com `clientUuid` repetido.
- **Docs de fase**: entrada no `DIARIO.md` (append), status no `ROADMAP.md` (tabela), doc do módulo (`qualidade.md`, `campo.md`, `suprimentos.md`…) e este `devcurrent.md`.
- **RAG**: para detalhes de uma seção, prefira `npm run rag:query <termo>` em vez de ler `DIARIO.md`/`ROADMAP.md` inteiros.

## 4. Backlog E12: PWA/fila offline completa — ✅ FECHADO (29/10)

Contexto e implementação detalhada em `docs/rag-index.md` (chunks `diario-*` e
`devcurrent-*`) e no DIARIO 29/10. Resumo: PWA (manifest + SW) + fila offline
IndexedDB (creates, fotos com Blob, PATCH editáveis) + sync FIFO + banner de
status + regra de conflito. Sem migration. Em produção: commits `116bd7a`,
`dec1951`. Playwright fora (sem infra e2e).

## 5. E08+ Cost Tracking & Cash Flow — ✅ IMPLEMENTADO (01/11)

Extensão do módulo de Custos (E08) + integração com Procurement (E14) +
Schedule (E07):

- **Rastreio por WBS/atividade**: `CostItem`, `CostCommitment` e `CostActual`
  agora carregam `wbsNodeId` e `activityId` (FKs). CostCommitment referencia
  `purchaseOrderId`; CostActual referencia `goodsReceiptId`.
- **Integração automática Procurement → Cost**:
  - PO emitido (ISSUED) → cria `CostCommitment` vinculado (idempotente por PO).
  - Recebimento confirmado → cria `CostActual` vinculado (idempotente por GR).
- **Fluxo de caixa CSV**: rotas
  `GET/POST /api/v1/projects/[id]/cost/cashflow/{export,import}` — exporta
  planejado/comprometido/realizado; importa custos indiretos (categoria
  INDIRETO/OUTROS) como CostItem com WBS/atividade nulos.
- Migration: `phase17_cost_tracking` (aplicada local; produção via
  `prisma migrate deploy`).
- Migration pendente em produção: aplicar `phase17_cost_tracking` no Neon.

## 6. E14 Procurement — ✅ COMPLETO (Fatia 1 + Fatia 2)

- **Fatia 1** (produção 30/10): fornecedores (SP), requisições (PR), cotações
  (QT) e mapa comparativo (BC). Commit `2ea90bb`, migration `phase15_procurement`,
  deploy `mici-5w7tzxsmi-homeland1`.
- **Fatia 2** (produção): PO (`PO001`) + recebimento (`GR001`), com rotas
  `procurement/orders`, `procurement/receipts`, migration `phase16_procurement`.
  Commits `e4555bb` … `9e5c259`. Detalhes: `suprimentos.md` (seções 5–7).
- Próximo: **E15 Commissioning** (a cargo do usuário).

## 6. Restante do roadmap (após E14)

| Épico | Escopo curto |
|---|---|
| E15 Commissioning | Plano, teste, reteste, aceite |
| E16 Sustainability | PSP, baseline, metas, medições, resíduo, relatório |
| E17 Dashboard | Portfólio, executivo, projeto, campo |
| E18 AI | AI Gateway, prompts, extração, resumo diário, classificação, busca semântica (inclui RAG/embeddings do produto) |

## 7. Ponteiros rápidos de código

- Procurement (E14): `src/modules/procurement/*`
- Cost tracking & cash flow (E08+): `src/modules/cost/cashflow.ts` · rotas `api/v1/projects/[id]/cost/cashflow/{export,import}` · módulos `cost/{items,commitments,actuals}.ts` (WBS/atividade/PO/GR) · doc `custos.md`. · rotas `api/v1/projects/[id]/procurement/*` e `api/v1/suppliers/*` · UI `src/components/procurement/*` e `src/app/(app)/suprimentos` e `src/app/(app)/projetos/[id]/suprimentos` · doc `suprimentos.md` · testes `tests/{unit/procurement-engine,integration/procurement}.test.ts`.
- Campo (E12/backlog): `src/modules/field/*` · rotas `api/v1/projects/[id]/field/*` · UI `src/components/field/field-view.tsx` · fila offline `src/lib/offline-queue.ts` + `public/sw.js` + `src/app/manifest.ts` · testes `tests/{unit/offline-queue,unit/field-engine,integration/field}.test.ts`.
- Qualidade (E13): `src/modules/quality/*` (inclui `punch-items.ts`) · `qualidade.md` · testes `tests/{unit/quality-engine,integration/quality}.test.ts`.
- Auth/permissões: `src/lib/auth.ts` · guards nas rotas · seed em `prisma/seed.ts`.
- Schema completo: `prisma/schema.prisma` (~2500 linhas).
- RAG de docs: `scripts/rag-index.mjs`, `scripts/rag-query.mjs`, `docs/rag-index.{json,md}`.

## 8. RAG — índice de chunks (auto-gerado)

- Índice completo: `docs/rag-index.md` (178 chunks em 6 arquivos) e
  `docs/rag-index.json` (com line ranges).
- Regenerar após editar docs: `npm run rag:index`.
- Recuperar só o necessário: `npm run rag:query <termo>` (ex.:
  `npm run rag:query procurement PO recebimento`).
- Convenção: ao precisar de detalhe de uma fase, consultar o chunk em vez de
  ler `DIARIO.md`/`ROADMAP.md` inteiros.

## 9. Riscos conhecidos

- Upload de arquivo OneDrive online-only falha no browser (copiar local antes; mensagem do MICI já orienta).
- `vercel --prod` deploya o diretório local (não só o push) — working tree limpa antes.
- PS 5.1 não tem `-SkipHttpErrorCheck` (usar try/catch em smoke scripts).
- `Get-ChildItem` trata `[id]` como curinga — usar `-LiteralPath`.
- `q.sql` untracked na raiz — verificar se deve ser commitado ou removido.
- PO/recebimento (Fatia 2) agora cobertos por `tests/integration/procurement-orders.test.ts` (17 casos: criação, idempotência, validações de estado, edição, transições, exclusão, recebimento parcial/total, isolamento). Testes unitários do engine de PO/recebimento ainda não existem (lacuna opcional).