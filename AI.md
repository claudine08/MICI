# IA (E18) — Guia de Funcionamento

## Visão geral
Módulo de inteligência artificial do MICI: gateway unificado para LLMs, registro de prompts e histórico de requisições. Permite resumo diário de obra, classificação de risco, extração de documentos e busca semântica.

## Configuração
Variáveis de ambiente (Vercel / `.env.local`):
- `OPENCODE_API_KEY` — chave do OpenCode Zen (modelos free). **Preferencial**; usa endpoint `https://opencode.ai/zen/v1`.
- `OPENCODE_BASE_URL` — (opcional) base URL do OpenCode Zen (default `https://opencode.ai/zen/v1`).
- `OPENAI_API_KEY` — (fallback) chave da OpenAI, usada se `OPENCODE_API_KEY` não estiver definida.
- `AI_MODEL` — modelo padrão (default: `glm-5.3-flash-free`).

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
- Prioriza `OPENCODE_API_KEY`: chama `{OPENCODE_BASE_URL}/chat/completions` (default `https://opencode.ai/zen/v1`) com o modelo configurado (default `glm-5.3-flash-free`).
- Fallback: se `OPENCODE_API_KEY` ausente, usa `OPENAI_API_KEY` em `https://api.openai.com/v1`.
- Se nenhuma chave: retorna mock `[MOCK AI - {model}] ...`.
- Em caso de falha (quota/auth/rede), faz fallback para mock e retorna `status: "SUCCESS"` com aviso.
- Toda requisição é persistida em `ai_requests` com status `SUCCESS`/`FAILED`, tokens e mensagem de erro.

## Testes
- Smoke autenticado: `GET /ai` → 200; `POST /ai/run` → 200 com `status: "SUCCESS"`.
- Sem sessão → 401.

## Provedor padrão: OpenCode Zen (modelo free)
O MICI usa por padrão o **OpenCode Zen** com o modelo free **`glm-5.3-flash-free`** (zero retention, sem uso para treino), adequado para resumo, classificação e extração de textos de projeto. O gateway prioriza `OPENCODE_API_KEY`; se ausente, tenta `OPENAI_API_KEY`; se nenhuma, usa mock.

### Como habilitar IA real (OpenCode Zen)
1. Crie uma conta em https://opencode.ai e gere uma API key (Console → API keys).
2. No Vercel: Settings → Environment Variables → adicione `OPENCODE_API_KEY`.
3. (Opcional) `OPENCODE_BASE_URL` (default `https://opencode.ai/zen/v1`) e `AI_MODEL` (ex.: `deepseek-v4.1-flash-free`, `glm-5.3-flash-free`).
4. Redeploy. As requisições passarão a usar o modelo real e retornar tokens.

### Alternativa: OpenAI
1. Obtenha uma chave em https://platform.openai.com/api-keys.
2. Garanta créditos na conta (billing).
3. No Vercel: adicione `OPENAI_API_KEY` (e opcionalmente `AI_MODEL`, ex.: `gpt-4o-mini`).
4. Redeploy.

## Tratamento de falhas
Se a OpenAI estiver indisponível (sem créditos, quota, auth), o gateway faz **fallback automático para mock** e retorna `status: "SUCCESS"` com um aviso no output e `errorMessage` preenchido. A UI continua funcionando. O histórico registra a falha.