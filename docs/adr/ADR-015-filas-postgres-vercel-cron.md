# ADR-015 — Filas e jobs: PostgreSQL + Vercel Cron

**Status:** aceito · **Data:** 2026-10-03 · **Substitui (MVP):** ADR-007

## Contexto

A spec define Celery + Redis para jobs (ADR-007) e outbox para eventos
confiáveis (ADR-009). No MVP o deploy é serverless no Vercel: manter Redis e
workers Celery adiciona infraestrutura, custo e operação sem benefício
proporcional na primeira entrega.

## Decisão

1. Fila de jobs em Postgres: tabela `job_queue` (status, `run_at`, tentativas,
   `locked_at/locked_by`, `dedupe_key` único).
2. **Vercel Cron** dispara um route handler periodicamente que:
   reivindica jobs pendentes (UPDATE condicional `PENDING → RUNNING`),
   executa e grava `SUCCESS`/`FAILED` com backoff por `run_at`.
3. **Outbox de eventos** (ADR-009) preservado: `domain_events` gravado na mesma
   transação do comando; o publisher assíncrono é um job desta fila.
4. Retry com teto (`max_attempts`) e dead-letter (`status = DEAD`) para
   reprocessamento manual.

## Consequências

- Zero infraestrutura extra no MVP (só Postgres + Vercel).
- Idempotência e deduplicação via `dedupe_key` — obrigatório em jobs
  reivindicáveis.
- Janela de execução limitada ao timeout do Vercel Cron; jobs longos devem ser
  particionados.
- Se o volume justificar, trocar para Redis/worker dedicado não altera o
  contrato dos produtores (continuam gravando `job_queue`/`domain_events`).
