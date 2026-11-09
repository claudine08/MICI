# FIX.md — ciclo de checagem geral

## 1. Clientes — código não gerado automaticamente

**Problema reportado:** ao criar um novo cliente (ex.: "Lusos Restaurante"), nenhum código de cliente era gerado automaticamente; o campo ficava vazio.

**Causa:** `createClient` em `src/modules/portfolio/clients.ts` só persistia `code` quando informado manualmente; quando ausente, gravava `null`.

**Correção aplicada:** implementada função `nextClientCode(organizationId)` que gera sequencial `CLI001`, `CLI002`, ... por organização (mesmo padrão de fornecedores/qualidade). Em `createClient`, quando `code` não é informado, o código é gerado automaticamente antes de validar disponibilidade.

**Arquivos alterados:**
- `src/modules/portfolio/clients.ts`

**Status:** corrigido (typecheck OK). Testes de integração de clientes não existem; validar manualmente criando cliente sem código.