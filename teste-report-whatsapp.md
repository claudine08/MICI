# Teste — Reporte de Campo via WhatsApp (E12+)

## Pré-requisitos
- Postgres local rodando (`mici-postgres`) e `pg_isready` OK.
- `npm run dev` ativo em `http://localhost:3000`.
- Usuário com telefone cadastrado (E.164) e membro ativo de uma organização com projeto.

## Variáveis de ambiente (opcional)
- `WHATSAPP_VERIFY_TOKEN` — token de verificação do webhook.
- `WHATSAPP_PHONE_NUMBER_ID` e `WHATSAPP_ACCESS_TOKEN` — se ausentes, a confirmação é apenas logada (`[whatsapp:dev]`).

## 1) Verificar webhook (GET)
```bash
curl "http://localhost:3000/api/v1/integrations/whatsapp/inbound?hub.mode=subscribe&hub.verify_token=SEU_TOKEN&hub.challenge=12345"
```
Esperado: `12345`.

## 2) Criar diário (mensagem comum)
```bash
curl -X POST http://localhost:3000/api/v1/integrations/whatsapp/inbound \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "5511999999999",
            "id": "wamid.diario",
            "text": { "body": "Concretagem da laje concluída" }
          }]
        }
      }]
    }]
  }'
```
Esperado: `{ "processed": 1, "created": 1, "skipped": 0 }`.

## 3) Criar restrição (comando)
```bash
curl -X POST http://localhost:3000/api/v1/integrations/whatsapp/inbound \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "5511999999999",
            "id": "wamid.rest",
            "text": { "body": "restricao: Falta de cimento no bloco B" }
          }]
        }
      }]
    }]
  }'
```
Esperado: `{ "processed": 1, "created": 1, "skipped": 0 }`.

## 4) Validar no banco/app
- Diário: `activities = "Reporte via WhatsApp"`, `occurrences = texto`.
- Restrição: `title` e `description` conforme comando.

## Observações
- O número deve estar cadastrado em `User.phone`.
- O usuário precisa ter membership ativo e existir projeto na organização.
- Sem credenciais do WhatsApp, a confirmação aparece no console (`[whatsapp:dev]`).