# Cronograma × Módulo Campo — Origem da Execução

## Contexto

Nem toda atividade do cronograma é executada por equipes de campo. Exemplos:

- Fechamento de contrato com fornecedor (Suprimentos)
- Aprovações, revisões e entregas de escritório
- Atividades administrativas/financeiras

O módulo Campo foi desenhado para **medição física de obra** (BR-006): a medição é a fonte do
`physicalProgress` da atividade. Portanto, atividades de escritório não devem depender de
medições de campo para atualizar seu avanço.

## Comportamento atual

- Medição de avanço no Campo vinculada a uma atividade sincroniza automaticamente o
  `physicalProgress` da atividade do cronograma (`syncActivityProgress` → `updateActivityProgress`),
  recalculando forecast/CPM.
- É possível editar o percentual e as datas reais diretamente no cronograma. Isso atualiza a
  atividade e recalcula o cronograma, **mas não cria medição/histórico no Campo**.

## Risco

Se atividades de campo e de escritório usarem o mesmo fluxo sem distinção:

- Percentual de campo pode ser “inflado” por tarefas administrativas.
- Auditoria do Campo fica incompleta para atividades atualizadas diretamente no cronograma.
- Equipes de campo podem tentar registrar medições para atividades que não são de obra.

## Proposta

### 1. Indicador de origem da execução na atividade

Adicionar um campo (ex.: `executionSource`) com valores sugeridos:

- `CAMPO` — atividade executada por equipe de campo (obra).
- `ESCRITORIO` — atividade executada por equipe de escritório.
- `SUPRIMENTOS` — atividade executada pelo módulo de Suprimentos.
- `OUTRO` — demais casos.

### 2. Regras por origem

- `CAMPO`:
  - Percentual **não** pode ser editado manualmente no cronograma.
  - Atualização apenas via medição no módulo Campo.
- `ESCRITORIO` / `SUPRIMENTOS` / `OUTRO`:
  - Percentual e datas reais podem ser editados diretamente no cronograma.
  - Ou atualizados pelo módulo de origem via API de progresso da atividade.

### 3. Integração com Suprimentos

Ao fechar um contrato (ou concluir uma tarefa administrativa), o módulo de Suprimentos pode chamar:

```
POST /api/v1/projects/{projectId}/activities/{activityId}/progress
{ "physicalProgress": 100, "status": "COMPLETED" }
```

Isso mantém auditoria (`PROGRESS`) e recalcula o cronograma, sem depender da equipe de campo.

### 4. Relatórios

- Dashboards de campo filtram atividades com `executionSource = CAMPO`.
- O cronograma exibe todas as atividades, com badge de origem (ex.: “Campo” / “Escritório”).

## Implementação sugerida (fases)

1. Schema + backend:
   - Adicionar `executionSource` em `ScheduleActivity` (Prisma) e nas interfaces de create/update.
   - Validar no schema (enum).
2. Regras:
   - Bloquear edição manual de `physicalProgress` quando `executionSource = CAMPO`.
   - Permitir edição quando `executionSource != CAMPO`.
3. UI:
   - Seletor de origem no formulário de atividade.
   - Badge na tabela de atividades.
   - Desabilitar campo de percentual para atividades de campo.
4. Integração:
   - Helper no módulo Suprimentos para atualizar atividade vinculada.

## Observação

A edição manual de percentual no cronograma já existe e é útil para tarefas de escritório.
A sugestão acima apenas **formaliza** essa separação, evitando que atividades de campo sejam
atualizadas fora do módulo Campo.
