# Sustentabilidade (E16) — Guia de Teste

## Acesso
- URL: https://mici-theta.vercel.app
- Login: admin@mici.demo / Demo@1234
- Projeto demo: DEMO-001 → menu Sustentabilidade → /projetos/{id}/sustentabilidade

## Fluxo UI

### a) Plano (PSP)
1. Aba Planos → "Novo plano".
2. Preencha título, descrição, responsável, datas, WBS/atividade.
3. Criar → status DRAFT. Use ações ACTIVATE → ACTIVE, COMPLETE → COMPLETED, CANCEL.

### b) Métrica
1. Aba Métricas → "Nova métrica".
2. Nome, unidade, categoria, descrição, plano (opcional).
3. Criar → contadores de baselines/metas/medições.

### c) Resíduo
1. Aba Resíduos → "Novo resíduo".
2. Tipo, quantidade, unidade, destino, data, WBS/atividade, notas.
3. Criar → excluir disponível.

### Baselines / Metas / Medições
Listagem + exclusão na UI. Criação/edição via API (abaixo).

## Endpoints API

Base: /api/v1/projects/{id}/sustainability

- GET/POST /plans ; PATCH/DELETE /plans/{planId} ; POST /plans/{planId}/status (body: {"action":"ACTIVATE"})
- GET/POST /metrics ; PATCH/DELETE /metrics/{metricId}
- GET/POST /baselines (body: {"metricId":"...","value":100,"recordedAt":"2026-11-02"}) ; PATCH/DELETE /baselines/{baselineId}
- GET/POST /targets (body: {"metricId":"...","targetValue":80,"dueDate":"2026-12-31"}) ; PATCH/DELETE /targets/{targetId}
- GET/POST /measurements (body: {"metricId":"...","value":90,"measuredAt":"2026-11-02"}) ; PATCH/DELETE /measurements/{measurementId}
- GET/POST /wastes ; PATCH/DELETE /wastes/{wasteId}

## Permissões
- Sem sessão → 401.
- VIEWER → lista (VIEW) mas não cria (403 em POST).

## Integridade
- Códigos automáticos por projeto: SP001, SM001, SB001, ST001, MS001, WR001.
- Soft delete (deletedAt); idempotência por clientUuid.

## Limitações UI
- Baselines, metas e medições: apenas listagem + exclusão na UI; criação via API.