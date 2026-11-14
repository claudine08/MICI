# MICI — Central de Comunicação e Integrações
## Arquitetura Django/Python

**Versão:** 1.0 | **Data-base:** novembro de 2026

## 1. Princípios e ADRs
- **ADR-COM-001:** monólito modular Django + DRF; não iniciar como microserviço.
- **ADR-COM-002:** adapters; regras de negócio não chamam SDKs diretamente.
- **ADR-COM-003:** n8n orquestra; MICI mantém autorização, estado, auditoria e transações.
- PostgreSQL fonte de verdade; Celery/Redis para tarefas; object storage para anexos.

## 2. Arquitetura lógica
```text
MICI Web / PWA / Mobile
        |
Django REST API — Authentication / RBAC
        |
Communication Application Services
  |          |          |          |
Rules      Outbox      Inbox    Integrations
  |          |          |          |
  +----------+----------+----------+
                 |
             PostgreSQL
                 |
            Celery Workers
                 |
           Provider Adapters
        /       |       |       \
     Resend    Meta     FCM    Gmail API
        \       |       |       /
         Webhook Ingress / Polling
                 |
           Event Processing
                 |
             n8n opcional
```

## 3. Stack
Python, Django, Django REST Framework, PostgreSQL, Celery, Redis, Pydantic opcional para schemas externos, MinIO/S3-compatible, OIDC/Keycloak conforme arquitetura MICI, n8n self-hosted opcional, OpenTelemetry e observabilidade existente.

Não introduzir Kafka, Temporal ou microserviços no MVP sem justificativa de carga/complexidade.

## 4. Estrutura sugerida
```text
apps/communications/
  models/
    integration.py
    contact.py
    message.py
    template.py
    consent.py
    webhook.py
    device.py
  api/
    serializers.py
    views.py
    urls.py
    permissions.py
  application/
    dispatch_service.py
    inbound_service.py
    routing_service.py
    template_service.py
    event_handlers.py
  domain/
    events.py
    policies.py
    statuses.py
  providers/
    base.py
    email_resend.py
    gmail_inbound.py
    whatsapp_meta.py
    push_fcm.py
    telegram.py
  tasks/
    dispatch.py
    retry.py
    inbound.py
  webhooks/
    views.py
    verifiers.py
    handlers.py
  tests/
    unit/
    integration/
    contract/
```

## 5. Interfaces de provider
Contrato conceitual:
```python
from typing import Protocol

class MessageProvider(Protocol):
    def send(self, message, *, idempotency_key: str):
        ...

class WebhookVerifier(Protocol):
    def verify(self, request) -> bool:
        ...
```
Resultado normalizado: `provider_message_id`, `accepted`, `provider_status`, `retryable`, `error_code` sanitizado e `occurred_at`. Adapter converte SDK/API para o contrato MICI.

## 6. Serviços
`IntegrationConfigService`, `MessageComposer`, `RecipientResolver`, `DispatchService`, `InboundService`, `WebhookIngestionService`, `ConsentService`, `RoutingService`, `AuditService`.

## 7. Processamento assíncrono
HTTP persiste intenção e responde `202 Accepted`. Worker: claim da mensagem → validar tenant/consentimento/limites/credencial → chamar adapter → persistir resultado → retry transitório com backoff exponencial+jitter → dead-letter ao esgotar tentativas. Erros permanentes 4xx não são repetidos indiscriminadamente; respeitar `Retry-After`.

## 8. Transactional outbox
Gravar evento na mesma transação PostgreSQL da alteração de negócio sempre que possível. Worker publica/processa pendências. Entrega entre sistemas é normalmente “at least once”; usar idempotência e deduplicação. Não prometer exactly-once.

## 9. Multi-tenancy
- Toda tabela possui `organization_id` ou relação inequívoca e protegida.
- Queryset sempre escopado server-side.
- Não confiar em tenant informado pelo cliente.
- Unicidade contextual inclui tenant.
- PostgreSQL RLS pode ser defesa adicional, nunca substituto do RBAC.
- Webhook resolve tenant pela integração/rota validada, não pelo JSON recebido.
- Testes negativos entre tenants obrigatórios.

## 10. Credenciais e OAuth
Preferir secret manager/vault; banco guarda apenas referência e metadados não sensíveis. Se armazenamento local for inevitável, criptografia autenticada com chave fora do banco, rotação e acesso restrito. Nunca logar tokens, refresh tokens, API keys ou assinaturas completas.
OAuth: authorization code, `state` aleatório e de uso único, PKCE quando suportado, redirect URI exata, escopos mínimos, refresh token protegido e fluxo de revogação/reconexão.

## 11. Anexos
Object storage privado. PostgreSQL guarda metadados, hash, MIME, tamanho, tenant e referência. Validar extensão/MIME real/tamanho; antivírus quando disponível; URL assinada curta ou download autenticado.

## 12. Webhooks
Endpoint por provider/integração; validar assinatura oficial usando corpo bruto quando exigido; timestamp/replay quando suportado; persistir ID/hash; deduplicar; responder rápido; processar em worker; limitar tamanho/taxa; nunca executar comando de negócio no handler HTTP.

## 13. Estados
Outbound: `draft → queued → processing → accepted → sent → delivered → read`; alternativos `failed`, `cancelled`, `expired`, `dead_letter`. Semântica varia por canal; nem todo provider fornece todos estados.
Integração: `pending`, `active`, `degraded`, `error`, `disabled`, `revoked`.
Webhook: `received`, `verified`, `queued`, `processed`, `rejected`, `duplicate`, `processing_failed`.

## 14. Limites de responsabilidade
A Central informa aprovação pendente, mas não aprova. Pode receber documento, mas não o considera aprovado. Ação externa vira solicitação pendente e passa pelo workflow MICI.
