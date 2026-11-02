# Sustentabilidade (E16)

Módulo de sustentabilidade: PSP (plano), métricas, baseline, metas, medições e resíduos.

## Entidades

- **SustainabilityPlan** (`SP001`): plano por projeto; status DRAFT → ACTIVE → COMPLETED / CANCELLED.
- **SustainabilityMetric** (`SM001`): métrica (nome, unidade, categoria) vinculada a plano opcional.
- **SustainabilityBaseline** (`SB001`): baseline por métrica.
- **SustainabilityTarget** (`ST001`): meta por métrica (valor alvo + prazo).
- **SustainabilityMeasurement** (`MS001`): medição por métrica (valor, data, WBS/atividade).
- **WasteRecord** (`WR001`): registro de resíduo (tipo, quantidade, unidade, destino, data).

## API

Base: `/api/v1/projects/[id]/sustainability/...`

- `plans` (GET/POST), `plans/[planId]` (PATCH/DELETE), `plans/[planId]/status` (POST).
- `metrics` (GET/POST), `metrics/[metricId]` (PATCH/DELETE).
- `baselines` (GET/POST), `baselines/[baselineId]` (PATCH/DELETE).
- `targets` (GET/POST), `targets/[targetId]` (PATCH/DELETE).
- `measurements` (GET/POST), `measurements/[measurementId]` (PATCH/DELETE).
- `wastes` (GET/POST), `wastes/[wasteId]` (PATCH/DELETE).

Permissão: `SUSTAINABILITY:VIEW/CREATE/EDIT/DELETE`.

## UI

`/projetos/[id]/sustentabilidade` — tabs Planos, Métricas, Baselines, Metas, Medições, Resíduos.