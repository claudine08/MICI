# FIX.md — ciclo de checagem geral

## 1. Clientes — código não gerado automaticamente

**Problema reportado:** ao criar um novo cliente (ex.: "Lusos Restaurante"), nenhum código de cliente era gerado automaticamente; o campo ficava vazio.

**Causa:** `createClient` em `src/modules/portfolio/clients.ts` só persistia `code` quando informado manualmente; quando ausente, gravava `null`.

**Correção aplicada:** implementada função `nextClientCode(organizationId)` que gera sequencial `CLI001`, `CLI002`, ... por organização (mesmo padrão de fornecedores/qualidade). Em `createClient`, quando `code` não é informado, o código é gerado automaticamente antes de validar disponibilidade.

**Arquivos alterados:**
- `src/modules/portfolio/clients.ts`

**Status:** corrigido e validado. Testes de integração criados em `tests/integration/clients.test.ts` (6 casos: geração automática CLI001/CLI002, código manual, duplicado CONFLICT, isolamento de tenant, soft delete) — todos verdes (07/11).

## 2. Cronograma — importação via template não usa datas planejadas do projeto

**Problema reportado:** ao importar o cronograma usando um template salvo, as datas de início/fim planejadas do projeto não estão sendo consideradas/aplicadas (atividade "A001 INÍCIO DO PROJETO" marco com datas 2026-11-02 a 2026-11-10 aparece sem vínculo com o planejamento do projeto).

**Causa provável:** `importSchedule` ancora apenas `project.startDate` quando ainda não existe; não ajusta `plannedStart/plannedFinish` das atividades nem `plannedEndDate` do projeto com base no template/snapshot, nem recalcula deslocando datas para o início planejado do projeto.

**Status:** corrigido e validado. Importação desloca todas as datas do cronograma (template ou arquivo) para o `startDate` planejado do projeto, preservando durações e dependências. Atualizado em `src/modules/schedule/importer.ts`. Coberto por novo teste em `tests/integration/schedule-import.test.ts` ("deslocamento de datas por startDate do projeto") — 20/20 testes verdes (07/11).

## 3. Requisitos — dropdown de WBS vazio na edição

**Problema reportado:** ao editar REQ-001, o campo "Nº de WBS" não apresenta opções (ficou em "Sem vínculo"). O backend aceita o vínculo (`wbsNodeId`) normalmente; a causa provável é ausência de nós WBS ativos no projeto (ou WBS não carregada na tela).

**Investigação (07/11):** código verificado — `getWbsTree` (selectors) filtra `deletedAt: null` e `flattenWbsTree` (engine) percorre todos os nós vivos. Quando o projeto não possui WBS, a lista é legitimamente vazia. Nenhum bug de carregamento encontrado.

**Correção aplicada (UX):** em `src/components/requirements/requirements-view.tsx`, o select de "Nó de WBS" agora:
- fica `disabled` quando `wbsOptions` está vazio;
- exibe a opção "Nenhum nó WBS cadastrado — crie na página de WBS";
- mostra texto de ajuda com link para `/projetos/{id}/wbs`.

**Ação/observação:** criar/verificar os nós WBS do projeto na página de WBS; após isso, eles aparecem no dropdown (recarregue a página de Requisitos). Se o projeto já tiver WBS ativa e o dropdown continuar vazio, registrar logs da requisição/estado do formulário.

**Status:** corrigido (UX) — typecheck OK.

### Como funciona a rastreabilidade do REQ-001

Após vincular o REQ-001 a um nó WBS (ex.: `1 - Reforma e expansão da cozinha`), a rastreabilidade
acontece de forma **indireta, via `wbsNodeId` compartilhado**:

1. O requisito REQ-001 passa a ter `wbsNodeId = <id do nó WBS>`.
2. As atividades do cronograma que também tiverem o mesmo `wbsNodeId` serão associadas a ele.
3. O endpoint `GET /api/v1/projects/{projectId}/traceability` retorna, para o REQ-001, o nó WBS
   e a lista de atividades vinculadas a esse nó.

Exemplo de resposta (quando houver atividade no mesmo nó WBS):

```json
{
  "traceability": [
    {
      "requirement": { "code": "REQ-001", "description": "expandir a operação para 2000 ref/dia", "status": "ACTIVE" },
      "wbs": { "code": "1", "name": "Reforma e expansão da cozinha" },
      "activities": [
        { "code": "A001", "name": "Início do projeto" }
      ]
    }
  ]
}
```

Se `activities` vier vazio, significa que nenhuma atividade do cronograma está vinculada ao mesmo
nó WBS do requisito; basta editar a atividade e selecionar o mesmo nó WBS para completar a
rastreabilidade.