# MICI — Central de Comunicação e Integrações
## APIs, Eventos e Webhooks

**Versão:** 1.0 | **Data-base:** novembro de 2026

## 1. Convenções
Prefixo `/api/v1/`; JSON UTF-8; OAuth2/OIDC/JWT MICI; TLS obrigatório; paginação; erros consistentes (`code`, `message`, `details`, `correlation_id`); `Idempotency-Key` em comandos repetíveis; datas ISO 8601; tenant derivado da identidade/contexto autorizado.

## 2. Endpoints propostos
| Método | Endpoint | Uso |
|---|---|---|
| GET | `/communications/integrations` | Listar integrações do tenant |
| POST | `/communications/integrations` | Criar configuração |
| POST | `/communications/integrations/{id}/test` | Testar |
| POST | `/communications/integrations/{id}/disable` | Desativar |
| GET/POST | `/communications/templates` | Consultar/criar templates |
| POST | `/communications/messages` | Enfileirar mensagem |
| GET | `/communications/messages/{id}` | Consultar status |
| GET | `/communications/messages` | Histórico |
| POST | `/communications/messages/{id}/retry` | Retry elegível |
| GET/POST | `/communications/contacts` | Consultar/criar contato |
| POST | `/communications/consents` | Registrar consentimento/estado |
| POST | `/communications/devices/register` | Registrar push |
| DELETE | `/communications/devices/{id}` | Revogar dispositivo |
| GET | `/communications/webhook-events` | Consultar eventos |

Endpoints administrativos exigem permissões específicas. Retry não ignora idempotência, consentimento ou estado definitivo.

## 3. Exemplo de envio
`POST /api/v1/communications/messages`

```http
Authorization: Bearer <token>
Content-Type: application/json
Idempotency-Key: project-42-overdue-task-2026-11-05
```
```json
{
  "channel": "email",
  "template_code": "project.activity.overdue",
  "locale": "pt-BR",
  "recipient_ids": ["8a8f..."],
  "project_id": "2d61...",
  "related_object": {"type": "schedule_activity", "id": "a14c..."},
  "variables": {
    "activity_name": "Instalação de coifa",
    "due_date": "2026-11-04"
  },
  "priority": "normal"
}
```
Resposta `202 Accepted`:
```json
{
  "id": "f421...",
  "status": "queued",
  "correlation_id": "c112...",
  "created_at": "2026-11-05T14:30:00Z"
}
```
`202` confirma registro/enfileiramento, não entrega pelo provider.

## 4. Evento comum
```json
{
  "event_id": "uuid",
  "event_type": "schedule.activity.overdue",
  "event_version": 1,
  "occurred_at": "2026-11-05T14:30:00Z",
  "organization_id": "uuid",
  "project_id": "uuid",
  "subject": {"type": "schedule_activity", "id": "uuid"},
  "data": {"activity_code": "WBS-4.2.1", "due_date": "2026-11-04"},
  "correlation_id": "uuid"
}
```
Não incluir segredos, dados pessoais desnecessários ou anexos binários.

## 5. Eventos iniciais
`project.created`; `workflow.approval.requested`; `workflow.approval.decided`; `schedule.activity.overdue`; `schedule.milestone.upcoming`; `procurement.quote.requested`; `procurement.proposal.received`; `field.occurrence.created`; `quality.nonconformity.created`; `risk.threshold.exceeded`; `document.revision.published`; `commissioning.action.pending`.

Eventos versionados; mudança incompatível exige nova versão.

## 6. Webhooks inbound
Rotas propostas:
- `POST /api/v1/webhooks/resend/{integration_public_id}`
- `POST /api/v1/webhooks/meta/whatsapp/{integration_public_id}`
- `GET|POST /api/v1/webhooks/meta/whatsapp/{integration_public_id}` para verificação conforme protocolo Meta
- `POST /api/v1/webhooks/custom/{integration_public_id}`

ID público não é segredo. Segurança depende de validação oficial de assinatura/token e vínculo com integração configurada.

## 7. Processamento
1. Validar método, tamanho e content-type.
2. Identificar integração.
3. Validar assinatura sobre corpo bruto quando exigido.
4. Validar timestamp/replay quando suportado.
5. Persistir evento e hash.
6. Deduplicar.
7. Responder rapidamente conforme protocolo.
8. Processar em worker.
9. Atualizar inbox/mensagem.
10. Auditar e medir.

Nunca confiar em tenant informado no payload.

## 8. Webhooks MICI → parceiros
Segredo por endpoint/tenant; HMAC-SHA256 sobre timestamp + corpo bruto; headers `MICI-Event-Id`, `MICI-Timestamp`, `MICI-Signature`; janela anti-replay; comparação em tempo constante; retries com backoff; idempotência; validação anti-SSRF (bloquear loopback, IPs privados, link-local e metadata endpoints; revalidar DNS/redirecionamentos); allowlist quando aplicável; rotação de segredo.

Formato conceitual: `MICI-Signature: v1=<hex_hmac>`. Não presumir que providers externos usem HMAC ou o mesmo método: implementar a especificação oficial de cada um.

## 9. Erros
| HTTP | Código | Significado |
|---|---|---|
| 400 | `invalid_payload` | Corpo inválido |
| 401 | `authentication_required` | Token ausente/inválido |
| 403 | `permission_denied` | Sem autorização |
| 404 | `resource_not_found` | Não visível ao tenant |
| 409 | `idempotency_conflict` | Chave repetida com conteúdo distinto |
| 422 | `consent_required` | Canal/finalidade não autorizada |
| 429 | `rate_limited` | Limite excedido |
| 502 | `provider_unavailable` | Falha externa |
| 503 | `integration_disabled` | Integração inativa |

## 10. Referências oficiais
- Resend: https://resend.com/docs
- Gmail API: https://developers.google.com/gmail/api
- WhatsApp Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api/
- Firebase Cloud Messaging: https://firebase.google.com/docs/cloud-messaging
- Telegram Bot API: https://core.telegram.org/bots/api
- n8n: https://docs.n8n.io/

Os contratos acima são do MICI. Endpoints específicos de fornecedores devem ser implementados a partir da documentação oficial vigente.
