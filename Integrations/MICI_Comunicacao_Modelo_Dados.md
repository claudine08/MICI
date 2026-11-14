# MICI — Central de Comunicação e Integrações
## Modelo de Dados PostgreSQL

**Versão:** 1.0 | **Data-base:** novembro de 2026

## 1. Convenções
UUID PK; timestamps `timestamptz` em UTC; `organization_id` obrigatório; JSONB apenas para metadados variáveis; binários em object storage; retenção e exclusão conforme política aprovada.

## 2. Entidades

### `communication_integrations`
`id uuid PK`, `organization_id FK`, `provider varchar(40)`, `channel varchar(30)`, `display_name varchar(120)`, `status varchar(20)`, `external_account_id varchar(255)`, `secret_ref varchar(500)`, `scopes jsonb`, `settings jsonb`, `last_tested_at timestamptz`, `last_error_code varchar(100)`, `created_by_id FK`, `created_at`, `updated_at`.
Unicidade contextual por tenant/provider/conta externa, ajustada para permitir múltiplas contas conforme regra de produto.

### `communication_contacts`
`id`, `organization_id`, `user_id nullable`, `display_name`, `email_normalized nullable`, `phone_e164 nullable`, `external_ref nullable`, `metadata jsonb`, `created_at`, `updated_at`.
Índices por tenant + e-mail e tenant + telefone. Não impor unicidade global.

### `communication_consents`
`id`, `organization_id`, `contact_id`, `channel`, `purpose`, `status` (granted/denied/withdrawn/expired), `legal_basis nullable`, `source`, `evidence_object_key nullable`, `granted_at`, `withdrawn_at`, `expires_at`, `created_at`.
A base legal deve ser avaliada por finalidade; consentimento não é necessariamente a única base aplicável.

### `communication_templates`
`id`, `organization_id nullable` (template global), `code`, `channel`, `locale`, `version`, `subject_template nullable`, `body_template`, `variables_schema jsonb`, `provider_template_name nullable`, `approval_status`, `status`, `created_by_id`, `created_at`, `published_at`.
Unique: tenant/code/channel/locale/version. Customização de template global cria versão própria.

### `communication_messages`
`id`, `organization_id`, `direction` (inbound/outbound), `channel`, `provider`, `integration_id`, `contact_id nullable`, `project_id nullable`, `related_object_type nullable`, `related_object_id nullable`, `template_id nullable`, `template_version nullable`, `subject nullable`, `body_text nullable`, `body_html nullable`, `status`, `provider_message_id nullable`, `idempotency_key nullable`, `correlation_id`, `scheduled_at`, `accepted_at`, `sent_at`, `delivered_at`, `read_at`, `failure_code`, `failure_detail_safe`, `metadata jsonb`, `created_by_id`, `created_at`, `updated_at`.
Índices: tenant+data; tenant+projeto+data; tenant+status+agendamento; provider+ID externo; unique parcial tenant+idempotency_key.

### `communication_message_recipients`
`id`, `organization_id`, `message_id`, `contact_id nullable`, `address_snapshot`, `recipient_type` (to/cc/bcc), `delivery_status`, `provider_recipient_id`, `created_at`. Snapshot mínimo para rastreabilidade; restringir exposição.

### `communication_attachments`
`id`, `organization_id`, `message_id`, `document_id nullable`, `object_key`, `original_filename`, `mime_type`, `size_bytes`, `sha256`, `scan_status`, `created_at`.

### `communication_webhook_events`
`id`, `organization_id nullable até resolução segura`, `integration_id`, `provider`, `external_event_id`, `event_type`, `payload_hash`, `payload_object_key`, `signature_valid`, `status`, `received_at`, `processed_at`, `error_code`, `correlation_id`.
Deduplicar por integration + ID externo quando disponível.

### `communication_devices`
`id`, `organization_id`, `user_id`, `platform`, `device_token_encrypted_or_secret_ref`, `device_label`, `status`, `last_seen_at`, `created_at`, `revoked_at`. Tokens protegidos e revogáveis.

### `communication_delivery_attempts`
`id`, `organization_id`, `message_id`, `attempt_number`, `started_at`, `finished_at`, `result`, `provider_request_id`, `error_code`, `retryable`, `latency_ms`, `correlation_id`.

### `communication_routing_rules`
`id`, `organization_id`, `event_type`, `project_id nullable`, `channel`, `template_id`, `recipient_rule jsonb`, `priority`, `enabled`, `created_at`, `updated_at`. Alterações relevantes devem ser versionadas/auditadas.

## 3. Relacionamentos
```text
Organization
 ├─ Integrations
 ├─ Contacts ─ Consents
 ├─ Templates
 ├─ Messages ─ Recipients
 │              ├─ Attachments
 │              └─ DeliveryAttempts
 ├─ WebhookEvents
 ├─ Devices
 └─ RoutingRules

Message → optional Project / Domain Object
Integration → Provider Webhook Events
```

## 4. Integridade
- FKs `PROTECT`/`RESTRICT` para histórico.
- CHECK constraints para estados críticos.
- Todas as consultas escopadas por tenant.
- Relação polimórfica validada por registry allowlist; nunca reflection/import arbitrário.
- Não aceitar `organization_id` do cliente como autoridade.
- Não excluir fisicamente registros de auditoria fora da política de retenção.

## 5. SQL ilustrativo
```sql
CREATE TABLE communication_integrations (
    id uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations(id),
    provider varchar(40) NOT NULL,
    channel varchar(30) NOT NULL,
    display_name varchar(120) NOT NULL,
    status varchar(20) NOT NULL,
    secret_ref varchar(500),
    scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
    settings jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_comm_integration_tenant_provider
 ON communication_integrations (organization_id, provider);

CREATE TABLE communication_messages (
    id uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations(id),
    direction varchar(10) NOT NULL CHECK (direction IN ('inbound','outbound')),
    channel varchar(30) NOT NULL,
    provider varchar(40) NOT NULL,
    integration_id uuid REFERENCES communication_integrations(id),
    project_id uuid REFERENCES projects(id),
    status varchar(30) NOT NULL,
    idempotency_key varchar(255),
    correlation_id uuid NOT NULL,
    provider_message_id varchar(255),
    body_text text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_comm_message_idempotency
 ON communication_messages (organization_id, idempotency_key)
 WHERE idempotency_key IS NOT NULL;
CREATE INDEX ix_comm_message_project_time
 ON communication_messages (organization_id, project_id, created_at DESC);
```
Os nomes `organizations` e `projects` devem ser alinhados ao schema real do MICI. SQL ilustrativo, não migration pronta.

## 6. Escala
Começar com índices B-tree nos filtros usados. Avaliar particionamento mensal somente com evidência de volume. Evitar GIN indiscriminado em JSONB. Definir retenção antes de habilitar busca integral de conteúdo.
