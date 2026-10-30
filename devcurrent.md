# DEVCURRENT — ponto de retomada do desenvolvimento

> **Arquivo vivo de estado — fonte oficial de retomada do desenvolvimento**
> (decisão de 29/10/2026). Objetivo: retomar sem reler DIARIO/ROADMAP
> inteiros. **Atualize este arquivo a cada sessão relevante** (fim de fase,
> deploy, mudança de ambiente, novo backlog). `DIARIO.md` (histórico
> cronológico) e `ROADMAP.md` (status de épicos) continuam sendo atualizados
> por sessão, mas apenas para consulta histórica — não são mais a fonte de
> retomada. Profundidade de um módulo: `qualidade.md` etc.

**Última atualização:** 29/10/2026 (E12-backlog Fatia 1 — PWA/fila offline, gate verde, não commitado)

---

## 1. Estado atual (resumo de 1 linha)

E01–E13 **completos e em produção** (último deploy 29/10, commit
`accf167`/feat `01a0966`, punch list). **E12-backlog Fatia 1 (manifest + SW +
fila offline de criações + indicador de pendências) implementada e gate
completo verde** (lint/typecheck/238 unit/266 integração/build) — **ainda não
commitada nem deployada** (commit só sob pedido). Próxima: Fatia 2 (fotos
offline) ou E14+.

## 2. Ambiente e comandos (não precisa rediscover)

| Item | Valor |
|---|---|
| Repo | `https://github.com/claudine08/MICI.git`, branch `main` |
| Produção | Vercel `mici-theta.vercel.app` (projeto `mici`, team `team_wbWA52Y5iAGD3NRZNIrNEMAe`, CLI logada como `ccpjr8-1922`) |
| Banco prod | Neon `ep-lively-firefly-b7d3dgk3-pooler…/neondb` — URL em `.env.local` (puxada do Vercel; **nunca commitar**) |
| Migrations | 16 aplicadas no Neon (`init_foundation_identity` → `phase14_punch`) |
| Banco local | PostgreSQL 17 portátil em `%LOCALAPPDATA%\PostgreSQL17-data`; **sobe via tarefa agendada `mici-postgres`** (settings corrigidas 29/10: `AllowStartIfOnBatteries=True`; start via shell direto morre com `0xC0000142`) |
| Dev local | `npm run dev` → `http://localhost:3000`; seed demo: 5 usuários, login `admin@mici.demo` / `Demo@1234` |
| `.env*` | `DATABASE_URL` local usa `127.0.0.1` (Prisma não conecta em `localhost`/IPv6 nesta máquina). `prisma7.config.ts` carrega `.env` via dotenv (não `.env.local`) |
| Testes | `npm test` (unit/Vitest 5) · `MICI_TEST_NO_RESET=1 npm run test:integration` (global-setup pula `--force-reset`; banco `mici_test` já sincronizado via `prisma db push`) — **última execução: 238 unit / 17 arquivos + 266 integração / 14 arquivos, todos verdes** |
| Gate padrão entre fases | `npm run lint` · `npm run typecheck` · `npm test` · `MICI_TEST_NO_RESET=1 npm run test:integration` · `npm run build` — tudo verde antes de commitar |
| Deploy (fluxo fixo) | 1) commit `feat:` + push → 2) `prisma migrate deploy` com `DATABASE_URL` do `.env.local` (setar env antes; dotenv não sobrescreve) → 3) `npx vercel --prod` → 4) smoke autenticado → 5) commit `docs:` (DIARIO+ROADMAP+md do módulo) + push |
| Smoke autenticado | POST `/api/auth/csrf` → POST `/api/auth/callback/credentials` (email/password/csrfToken, `json=true`, seguir 302) → bater nas rotas com a WebSession; sem sessão deve dar 401 |
| Prisma 7 | `migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script`; comandos destrutivos exigem consentimento (`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` — autorizado só para reset do `mici_test`) |
| Next.js 16 | **Tem breaking changes** — ler `node_modules/next/dist/docs/` antes de escrever código (bloco em `AGENTS.md` é reescrito pelo `next dev`, manter) |

## 3. Convenções do repo (seguir à risca)

- **Commits**: só quando o usuário pedir. Padrão: `feat: <área> - <resumo> - E<NN> US<NN>` (ASCII, sem acento) e depois `docs: registra …`. `main` direto, sem PR.
- **Arquitetura por módulo**: `src/modules/<area>/` com `engine.ts` (máquina de estados puro + helpers), `schemas.ts` (zod), `selectors.ts` (linhas p/ UI + includes Prisma), `common.ts` (códigos sequenciais `PREFIX001`), writer (ex.: `punch-items.ts`) com audit + domain events + idempotência `clientUuid`.
- **API**: `src/app/api/v1/projects/[id]/<area>/…` — auth (Auth.js), `assertMember`, permissões por módulo (`QUALITY:VIEW/CREATE/EDIT/DELETE`, `FIELD:*` etc.), erro padronizado `{error:{code,message,correlation_id}}`.
- **UI**: server component na página (`src/app/(app)/projetos/[id]/…/page.tsx`) carrega via `list*` do selector; cliente é `src/components/<area>/<area>-view.tsx` (tabs + diálogos shadcn/RHF/zod).
- **Testes**: unit puro no engine; integração com seed + tenant isolation; idempotência testada com `clientUuid` repetido.
- **Docs de fase**: entrada no `DIARIO.md` (append), status no `ROADMAP.md` (tabela), doc do módulo (`qualidade.md`, `campo.md`…) e este `devcurrent.md`.

## 4. PRÓXIMA FRENTE — Backlog E12: PWA/fila offline completa

Contexto: E12 (Campo) está em produção mas **só a idempotência
server-side entrou**. O offline real (PWA + fila local) ficou em backlog
"quando houver demanda" — usuário decidiu retomar agora.

**STATUS 29/10/2026 — Fatia 1 CONCLUÍDA (gate verde, pendente de commit+deploy):**

Arquivos criados/alterados:
- `src/lib/offline-queue.ts` (novo): tipos `OfflineEntity`/`OfflineQueueItem`;
  stores `MemoryQueueStore` e `IndexedDbQueueStore` (DB `mici-offline`, store
  `field-queue`, singleton `getQueueStore()`); `enqueueCreate` (gera key,
  extrai `clientUuid` do payload, dispara evento `mici:queue-changed`);
  `getQueueCounts`; `discardFailedItems`; `flushQueueWith(store, send)` FIFO
  — sucesso remove, 4xx → `failed` (não reenvia sozinho), ApiError status 0 →
  interrompe flush (fica `pending`), 5xx → `pending` com `attempts++`;
  `flushQueue()` global com trava de concorrência; `sendOrQueueCreate` devolve
  `"sent" | "queued"` (offline check + ApiError 0 → fila; 4xx → relança).
- `src/app/manifest.ts` (novo): `MetadataRoute.Manifest` → `/manifest.webmanifest`
  (start_url `/painel`, standalone, theme `#2563eb`, ícones SVG).
- `public/icon.svg` (novo) e `public/sw.js` (novo): cache-first `/_next/static/`,
  network-first navegações com fallback, nunca intercepta `/api/` nem não-GET;
  cache `mici-shell-v1` + cleanup no activate.
- `src/components/service-worker-register.tsx` (novo): registra `/sw.js` só em
  produção; montado no `src/app/layout.tsx` (+ `viewport.themeColor`).
- `src/components/field/field-view.tsx` (alterado): os 4 creates (diário/tarefa/
  restrição/medição) passam por `sendOrQueueCreate` (edições PATCH continuam
  online-only); estado `info` + `InfoBox`; banner warning com contagem
  pending/failed + "Sincronizar agora" + "Descartar falhas"; listeners de
  `mici:queue-changed`/`online` (conectividade via `useSyncExternalStore`).
- `tests/unit/offline-queue.test.ts` (novo): 12 testes (store, enqueue, contagens,
  flush FIFO/4xx/rede/5xx, sendOrQueueCreate sent/queued/4xx).
- `tests/integration/field.test.ts` (alterado): idempotência de restrição com
  `clientUuid` adicionada (lacuna fechada; era a única das 4 sem teste).

Gate 29/10: lint ✓ · typecheck ✓ · 238 unit/17 arquivos ✓ · 266 integração/14
arquivos ✓ · build ✓ (`/manifest.webmanifest` gerado). **Nada commitado.**

### 4.1 O que já existe (base pronta — reaproveitar)

- **`clientUuid` idempotente em TODAS as 5 entidades de campo** (schema:
  coluna `client_uuid uuid`, único `[projectId, clientUuid]`; schemas zod:
  `clientUuid = z.string().uuid().optional()`; clientes já enviam
  `crypto.randomUUID()` nos creates):
  - `FieldDiary` (FD001) — `src/modules/field/diaries.ts`
  - `FieldTask` (FT001) — `tasks.ts`
  - `Constraint` (CN001) — `constraints.ts`
  - `PhotoEvidence` (PH001, bytea 4 MB + SHA-256) — `photos.ts`
  - `ProgressMeasurement` (PM001) — `progress.ts`
- **14 rotas** `src/app/api/v1/projects/[id]/field/*` (diaries/tasks/constraints/photos/progress/summary + transições `/status`).
- **Telas**: home `/campo` e `/projetos/[id]/campo` (`src/components/field/field-view.tsx` + páginas).
- **Idempotência server-side**: reenvio do mesmo `clientUuid` devolve o registro já criado (testado em `tests/integration/field.test.ts`).
- **Fila/infra de jobs** (se optar por sync server-side assíncrono): `job_queue`/`domain_events` + Vercel Cron (ADR-015, `docs/adr/ADR-015-filas-postgres-vercel-cron.md`).

### 4.2 O que falta construir (escopo do backlog)

1. **PWA instalável**: `manifest` + ícones + registro de **service worker** (Next 16 — checar docs locais; provavelmente route handler + build de SW).
2. **Fila local offline (IndexedDB)**: capturar mutations de criação (diário/tarefa/restrição/foto/medição) quando offline; gerar `clientUuid` no momento da captura; retry automático com backoff ao voltar.
3. **Sync engine no cliente**: enviar fila em ordem FIFO por entidade; tratar 4xx (erro de negócio → marcar como falha definitiva e mostrar ao usuário) vs 5xx/timeout (repetir).
4. **Upload de fotos offline**: enfileirar Blob/FormData e reenviar (atenção ao teto de 4 MB e SHA-256).
5. **UI de status**: indicador "N pendentes de sincronizar", fila visível (erros reenviáveis vs definitivos), ação "sincronizar agora".
6. **Conflitos**: definição mínima — hoje `clientUuid` evita duplicata; divergência de conteúdo (dois dispositivos no mesmo diário) precisa de regra (ex.: último-wins no rascunho DRAFT, transições sempre revalidadas).

### 4.3 Restrições/decisões de ambiente

- Host **Vercel serverless** — sem WebSockets; sync é pull/push sob demanda. Fila local 100% client-side (IndexedDB), sem backend novo obrigatório (server já idempotente).
- ADR-015 permite `job_queue` + cron se algum processamento server-side for necessário (ex.: dedupe de fotos).
- Manter permitido o modo 100% online atual (fila só entra em ação sem rede).

### 4.4 Fatia sugerida (mesmo padrão de fases anteriores)

- **Fatia 1**: manifest + SW (cache de shell) + fila IndexedDB de creates simples (diário/tarefa/restrição/medição) + indicador de pendências. **✅ FEITA 29/10 (ver STATUS acima) — falta commitar/deployar.**
- **Fatia 2**: fotos offline + tratamento de conflito + "sincronizar agora" + testes (mock de offline no Vitest/Playwright — `@playwright/test` já está em devDependencies). Obs.: "sincronizar agora" já entrou na Fatia 1; resto segue pendente. Conflito de conteúdo (2 dispositivos no mesmo diário) ainda sem regra — último-wins em DRAFT é a candidata.

## 5. Restante do roadmap (após E12-backlog)

| Épico | Escopo curto |
|---|---|
| E14 Procurement | PR → cotação → comparação → aprovação → PO → recebimento |
| E15 Commissioning | Plano, teste, reteste, aceite |
| E16 Sustainability | PSP, baseline, metas, medições, resíduo, relatório |
| E17 Dashboard | Portfólio, executivo, projeto, campo |
| E18 AI | AI Gateway, prompts, extração, resumo diário, classificação, busca |

## 6. Ponteiros rápidos de código

- Campo (E12/backlog): `src/modules/field/*` · rotas `api/v1/projects/[id]/field/*` · UI `src/components/field/field-view.tsx` · fila offline `src/lib/offline-queue.ts` + `public/sw.js` + `src/app/manifest.ts` · testes `tests/{unit/offline-queue,unit/field-engine,integration/field}.test.ts` · doc `campo.md` (se existir; senão DIARIO 18–22/10).
- Qualidade (E13, referência de padrão maduro): `src/modules/quality/*` (inclui `punch-items.ts`) · `qualidade.md` · testes `tests/{unit/quality-engine,integration/quality}.test.ts`.
- Auth/permissões: `src/lib/auth.ts` · guards nas rotas · seed em `prisma/seed.ts`.
- Schema completo: `prisma/schema.prisma` (~2150 linhas).

## 7. Riscos conhecidos

- Upload de arquivo OneDrive online-only falha no browser (copiar local antes; mensagem do MICI já orienta).
- `vercel --prod` deploya o diretório local (não só o push) — working tree limpa antes.
- PS 5.1 não tem `-SkipHttpErrorCheck` (usar try/catch em smoke scripts).
- `Get-ChildItem` trata `[id]` como curinga — usar `-LiteralPath`.
