# Ollama — Modelo Free Local (B06)

## Visão geral
O módulo de IA do MICI suporta um provedor local via **Ollama**, permitindo rodar modelos free (llama3.2, mistral, phi3, etc.) sem custo e sem depender de APIs externas. Útil para desenvolvimento local e testes.

## Pré-requisitos
- Windows 10/11, macOS ou Linux.
- Pelo menos 8 GB de RAM (16 GB recomendado para modelos maiores).

## Instalação
1. Baixe o instalador em https://ollama.com/download.
2. Instale e verifique: `ollama --version`.
3. O serviço sobe automaticamente em `http://127.0.0.1:11434`.

## Baixar um modelo
```bash
ollama pull llama3.2        # ~2 GB, bom para testes
ollama pull mistral         # ~4 GB
ollama pull phi3            # ~2 GB, leve
```

Listar modelos instalados:
```bash
ollama list
```

## Configurar o MICI (desenvolvimento local)
No `.env.local` (ou `.env`):
```
OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
OLLAMA_MODEL=llama3.2
```

O Ollama expõe uma API OpenAI-compatible em `/v1/chat/completions`, então o MICI o trata como um provedor padrão.

## Uso
1. Rode `npm run dev` (http://localhost:3000).
2. Acesse `/ai` → selecione o modo **Ollama (modelo local free)**.
3. Execute uma consulta. A resposta virá do modelo local.

O endpoint `GET /api/v1/ai/status` reporta `ollama.available: true` quando o serviço está acessível.

## Limitações
- **Apenas em desenvolvimento local.** O Vercel não acessa seu `localhost`; em produção, o modo Ollama falhará e cairá para mock (ou OpenAI se configurada).
- Modelos locais são menos capazes que GPT-4/Claude para tarefas complexas, mas suficientes para testes de fluxo.
- O primeiro download do modelo pode demorar; requisições iniciais são lentas (carregamento em memória).

## Troubleshooting
- "Ollama indisponível": verifique se o serviço está rodando (`ollama serve`) e a porta 11434 acessível.
- Timeout: modelos grandes podem demorar; aumente o timeout do fetch se necessário.
- Memória: feche outros apps se o modelo não carregar.

## Referências
- https://ollama.com
- https://github.com/ollama/ollama/blob/main/docs/api.md