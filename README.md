# MICI — Plataforma de Gestão de Implantação

SaaS multiempresa (multi-tenant), multiprojeto e multiusuário para gestão de
implantação com **baseline imutável**, **port gates obrigatórios** e **auditoria
append-only**. Especificação de verdade: `MICI_SaaS_Technical_Architecture_Specification.md`
(raiz do repositório) + `PRD.md`.

## Stack

| Camada | Tecnologia |
|---|---|
| Aplicação | Next.js 16.3.8 (App Router, Route Handlers, TypeScript) |
| Banco | PostgreSQL 17 (local) / Neon (produção) + Prisma 7.10.0 |
| Auth | Auth.js v5 (NextAuth) — JWT + credenciais/scrypt |
| UI | Tailwind 4 + componentes próprios (padrão shadcn) |
| Testes | Vitest (unit) + Playwright (E2E, a partir da Fase 2) |
| Deploy | Vercel |
| Fila/Cron | Tabelas `job_queue`/`domain_events` + Vercel Cron (ADR-015) |

## Requisitos

- Node.js 24+ e npm 11+
- PostgreSQL 17+ local (ver opções abaixo)

### Opções de banco local

**1. Docker (máquinas com Docker/WSL2):**

```bash
docker compose up -d
```

**2. PostgreSQL portátil (usado nesta máquina — WSL2 indisponível):**

O cluster local fica em `%LOCALAPPDATA%\PostgreSQL17-data` com binários em
`%LOCALAPPDATA%\Programs\PostgreSQL17` (build oficial
[theseus-rs/postgresql-binaries](https://github.com/theseus-rs/postgresql-binaries),
verificado por SHA256). Para iniciar/reiniciar o servidor:

```powershell
$pg = "$env:LOCALAPPDATA\Programs\PostgreSQL17"
$data = "$env:LOCALAPPDATA\PostgreSQL17-data"
& "$pg\bin\pg_ctl.exe" -D $data -l "$data\server.log" start   # stop / restart
```

**3. Instalação nativa:** `winget install PostgreSQL.PostgreSQL.17` (ou conta
Neon/Supabase — a produção usa Neon, conforme §5 da spec).

## Setup

```bash
npm install            # instala dependências + prisma generate (postinstall)
cp .env.example .env   # configure DATABASE_URL e gere AUTH_SECRET
npm run db:migrate     # aplica migrations
npm run seed           # permissões, org demo e usuários demo
npm run dev            # http://localhost:3000
```

Usuários demo (seed — apenas ambiente local):

| E-mail | Papel |
|---|---|
| admin@mici.demo | ADMIN |
| pmo@mici.demo | PMO |
| gerente@mici.demo | PROJECT_MANAGER |
| qualidade@mici.demo | QUALITY |
| viewer@mici.demo | VIEWER |

Senha de todos: `Demo@1234`.

## Testes de integração (isolamento de tenant)

```bash
cp .env.test.example .env.test   # aponta para o banco mici_test (dedicado)
npm run test:integration         # reseta o schema (prisma db push --force-reset) e roda
```

- Banco local: crie `mici_test` no mesmo Postgres (o `db push --force-reset`
  também o cria).
- O reset **só** pode rodar em bancos de desenvolvimento/teste — nunca em
  produção. O CI usa o Postgres service do GitHub Actions.

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit (`tests/unit`) |
| `npm run test:integration` | Testes de integração/tenant (exige Postgres + `.env.test`) |
| `npm run seed` | Seed idempotente |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:deploy` | `prisma migrate deploy` (produção/CI) |
| `npm run db:generate` | Regenera Prisma Client |
| `npm run format` | Prettier |

## Estrutura

```text
src/
  app/                  # App Router (rotas /api/v1/*, /entrar, /painel)
  core/                 # erros, rbac, tenant, api, audit, events
  modules/              # domínio modular (identity, …)
  components/           # ui (primitivos) + shell (sidebar/topbar)
  lib/                  # prisma, auth, logger, password
  generated/prisma/     # Prisma Client (gerado, não versionado)
prisma/                 # schema, migrations, seed
tests/unit/             # Vitest
docs/adr/               # registros de decisão
```

## Regras inegociáveis (spec)

1. Todo objeto pertence a um `organization_id` vindo do contexto autenticado —
   nunca do body (`src/core/tenant.ts`).
2. Baseline imutável após aprovação; mudanças geram nova revisão.
3. Gates bloqueiam avanço sem critérios + evidências (BR-001/BR-002).
4. Auditoria append-only (`audit_events` — sem UPDATE/DELETE).
5. RBAC: 18 papéis × 25 módulos × ações VIEW..ADMIN (`src/core/rbac.ts`).
6. Testes de isolamento de tenant obrigatórios no CI (a partir da Fase 1).

## Deploy (Vercel)

1. Criar conta Neon (PostgreSQL) e obter `DATABASE_URL`.
2. `vercel link` + configurar env vars: `DATABASE_URL`, `AUTH_SECRET`
   (`openssl rand -base64 32`), `AUTH_URL` (domínio do app).
3. `npm run db:deploy` (migrations) e `npm run seed` (apenas primeiro deploy).
4. GitHub Actions (`.github/workflows/ci.yml`): lint → typecheck → test → build.
5. Cron: configurar Vercel Cron para `/api/v1/jobs/run` (ADR-015).

## Documentos

- `ROADMAP.md` — releases, épicos e status
- `docs/adr/` — registros de decisão (ADR-014 stack, ADR-015 filas/cron)
- Spec: `../MICI_SaaS_Technical_Architecture_Specification.md`
