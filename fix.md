# FIX.md — ciclo de checagem geral

## 1. Clientes — código não gerado automaticamente

**Problema reportado:** ao criar um novo cliente (ex.: "Lusos Restaurante"), nenhum código de cliente era gerado automaticamente; o campo ficava vazio.

**Causa:** `createClient` em `src/modules/portfolio/clients.ts` só persistia `code` quando informado manualmente; quando ausente, gravava `null`.

**Correção aplicada:** implementada função `nextClientCode(organizationId)` que gera sequencial `CLI001`, `CLI002`, ... por organização (mesmo padrão de fornecedores/qualidade). Em `createClient`, quando `code` não é informado, o código é gerado automaticamente antes de validar disponibilidade.

**Arquivos alterados:**
- `src/modules/portfolio/clients.ts`

**Status:** corrigido (typecheck OK). Testes de integração de clientes não existem; validar manualmente criando cliente sem código.

## 2. Cronograma — importação via template não usa datas planejadas do projeto

**Problema reportado:** ao importar o cronograma usando um template salvo, as datas de início/fim planejadas do projeto não estão sendo consideradas/aplicadas (atividade "A001 INÍCIO DO PROJETO" marco com datas 2026-11-02 a 2026-11-10 aparece sem vínculo com o planejamento do projeto).

**Causa provável:** `importSchedule` ancora apenas `project.startDate` quando ainda não existe; não ajusta `plannedStart/plannedFinish` das atividades nem `plannedEndDate` do projeto com base no template/snapshot, nem recalcula deslocando datas para o início planejado do projeto.

**Status:** corrigido — importação agora desloca todas as datas do cronograma (template ou arquivo) para o `startDate` planejado do projeto, preservando durações e dependências. Atualizado em `src/modules/schedule/importer.ts`.