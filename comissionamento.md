# Comissionamento (E15)

Módulo de comissionamento: plano de comissionamento, itens de teste/reteste e aceite formal.

## Entidades

- **CommissioningPlan** (`CP001`): plano por projeto; status DRAFT → ACTIVE → COMPLETED / CANCELLED.
- **CommissioningItem** (`CI001`): item de teste vinculado a um plano; status PLANNED → IN_PROGRESS → PASSED/FAILED → RETESTING → ACCEPTED.
- **Acceptance** (`AC001`): aceite formal; status DRAFT → APPROVED / REJECTED.

## API

Base: `/api/v1/projects/[id]/commissioning/...`

- `plans` (GET/POST), `plans/[planId]` (GET/PATCH/DELETE), `plans/[planId]/status` (POST).
- `items` (GET/POST), `items/[itemId]` (PATCH/DELETE), `items/[itemId]/status` (POST).
- `acceptances` (GET/POST), `acceptances/[acceptanceId]` (PATCH/DELETE), `acceptances/[acceptanceId]/status` (POST).

Permissão: `COMMISSIONING:VIEW/CREATE/EDIT/DELETE`.

## UI

`/projetos/[id]/commissioning` — tabs Planos, Itens, Aceites com dialogs de criação e transições.

## Testes

- Unit: motor de estados (a adicionar).
- Integração: a adicionar.