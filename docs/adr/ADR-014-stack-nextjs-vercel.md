# ADR-014 — Stack web: Next.js full-stack no Vercel

**Status:** aceito · **Data:** 2026-10-03 · **Supersede parcial:** ADR-006,
ADR-004 (parcialmente)

## Contexto

A spec prevê Django (backend) + React TypeScript (frontend) (ADR-006,
E01-US01/US02) e OIDC/Keycloak para identidade (ADR-004, E02-US01). O produto
MVP precisa de entrega rápida no Vercel, custo operacional mínimo e uma única
base de código para o time atual.

## Decisão

1. **Next.js 16 full-stack** (App Router + Route Handlers + Server Components)
   como monolito modular único — domínio em `src/modules/`, infra transversal em
   `src/core/`.
2. **Auth.js (NextAuth v5)** com estratégia JWT e credenciais (scrypt) para o
   MVP. OIDC/Keycloak (ADR-004) permanece no backlog (E02-US01) para quando
   houver necessidade SSO corporativo.
3. **Deploy no Vercel**; banco Neon Postgres (mesma engine da spec ADR-002).
4. Prisma 7 (fixado em 7.10.0) como ORM com driver adapter `pg`.

## Consequências

- Uma stack só: SSR/RSC reduz latência inicial e simplifica CI/CD.
- React + TypeScript (ADR-006) mantidos; apenas o "hosting model" muda.
- Multi-tenant continua garantido na camada de dados (`organization_id` +
  contexto autenticado), independente do framework.
- Migração futura para OIDC implica apenas trocar o provider do Auth.js.
- `middleware` do Next foi renomeado/evitado (Next 16 `proxy`); as checagens
  de tenant ficam em layouts e route handlers via `src/core/tenant.ts`.
