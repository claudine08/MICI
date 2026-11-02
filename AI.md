# IA (E18) — Guia de Funcionamento

## Visão geral
Módulo de inteligência artificial do MICI: gateway unificado para LLMs, registro de prompts e histórico de requisições. Permite resumo diário de obra, classificação de risco, extração de documentos e busca semântica.

## Configuração
Variáveis de ambiente (Vercel / `.env.local`):
- `OPENAI_API_KEY` — chave da OpenAI. Se ausente, o gateway retorna respostas **mock** (desenvolvimento).
- `AI_MODEL` — modelo padrão (default: `gpt-4o-mini`).

## Entidades (schema)
- **AiPrompt** (`ai_prompts`): registro de prompts (código, nome, descrição, template, modelo, isSystem). Escopo por organização (organizationId nullable para prompts globais).
- **AiRequest** (`ai_requests`): log de cada requisição (promptCode, input, output, model, status, tokens, errorMessage, projectId, createdAt).

## Módulo (`src/modules/ai/`)
- `common.ts` — helpers (assertAiProject).
- `gateway.ts` — `runAi(input)` executa a chamada ao LLM (OpenAI ou mock) e persiste o log.
- `prompts.ts` — `AI_PROMPTS`: catálogo padrão de 4 prompts.
- `selectors.ts` — `listAiRequests(orgId, projectId?, limit)`.
- `http.ts` — helpers HTTP.

## Prompts padrão
| Código | Nome | Uso |
|---|---|---|
| `DAILY_SUMMARY` | Resumo diário de obra | Resume diário em 5 bullet points |
| `RISK_CLASSIFY` | Classificação de risco | Classifica probabilidade/impacto e sugere resposta |
| `DOC_EXTRACT` | Extração de documento | Extrai título, data, valor, responsável |
| `SEMANTIC_SEARCH` | Busca semântica | Busca registros relevantes por significado |

## API
Base: `/api/v1/ai`

- `POST /ai/run` — body: `{ "promptCode": "DAILY_SUMMARY", "input": "...", "projectId": "uuid (opcional)" }`. Retorna `{ output, model, tokensIn, tokensOut, status, requestId }`.
- `GET /ai/requests?projectId=...` — lista histórico de requisições (mais recentes primeiro).

Permissão: `AI:VIEW` (leitura) / `AI:CREATE` (execução).

## UI
- Rota: `/ai` (menu lateral → Geral → IA).
- Tela com seletor de prompt, campo de input, projectId opcional, botão Executar e histórico de requisições (status, modelo, tokens).

## Gateway (detalhes)
- Se `OPENAI_API_KEY` estiver definida: chama `https://api.openai.com/v1/chat/completions` com o modelo configurado.
- Caso contrário: retorna `[MOCK AI - {model}] Resposta simulada para: ...` (útil para testes sem custo).
- Toda requisição é persistida em `ai_requests` com status `SUCCESS`/`FAILED`, tokens e mensagem de erro.

## Testes
- Smoke autenticado: `GET /ai` → 200; `POST /ai/run` → 200 com `status: "SUCCESS"`.
- Sem sessão → 401.

## Como habilitar IA real
1. Obtenha uma chave em https://platform.openai.com/api-keys.
2. Garanta créditos na conta (billing) — sem créditos, a API retorna 429.
3. No Vercel: Settings → Environment Variables → adicione `OPENAI_API_KEY`.
4. (Opcional) `AI_MODEL` (ex.: `gpt-4o`).
5. Redeploy. As requisições passarão a usar o modelo real e retornar tokens.

## Tratamento de falhas
Se a OpenAI estiver indisponível (sem créditos, quota, auth), o gateway faz **fallback automático para mock** e retorna `status: "SUCCESS"` com um aviso no output e `errorMessage` preenchido. A UI continua funcionando. O histórico registra a falha.