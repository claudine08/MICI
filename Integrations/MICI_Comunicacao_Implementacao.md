# MICI — Central de Comunicação e Integrações
## Segurança, LGPD, Testes e Roadmap

**Versão:** 1.0 | **Data-base:** novembro de 2026

## 1. Segurança e privacidade
Aplicar princípios LGPD de finalidade, adequação, necessidade, transparência, segurança, prevenção e responsabilização. Definir papéis controlador/operador conforme realidade contratual. Avaliar base legal por finalidade; não presumir consentimento como fundamento universal.

### Minimização
- Avisos curtos com link autenticado em vez de replicar documentos.
- Não enviar dados sensíveis por canais não aprovados.
- Não copiar conversas completas para n8n sem necessidade.
- Retenção por categoria/finalidade.
- Registrar origem/finalidade de contatos externos.
- Processar solicitações de titulares conforme papéis e procedimentos definidos.

### Controles
TLS; criptografia em repouso; secret manager; MFA administrativo; RBAC contextual; auditoria; rate limiting; sanitização HTML/anexos; antivírus quando disponível; logs redigidos; rotação de credenciais; plano de incidentes.

## 2. Matriz de permissões inicial
| Ação | Admin organização | Gerente projeto | Membro | Auditor |
|---|---|---|---|---|
| Configurar provider | Sim | Não | Não | Não |
| Consultar integração | Sim | Conforme escopo | Não | Leitura |
| Enviar manual | Sim | Conforme projeto | Política | Não |
| Consultar histórico | Tenant | Projeto | Escopo autorizado | Leitura |
| Gerenciar template tenant | Sim | Opcional | Não | Leitura |
| Reprocessar falha | Sim | Solicitar | Não | Não |
| Exportar auditoria | Política | Projeto | Não | Conforme papel |
Mapear à matriz RBAC real do MICI e validar segregação de funções.

## 3. Observabilidade
Métricas sugeridas:
- `mici_comm_messages_total{channel,provider,status}`
- `mici_comm_dispatch_latency_seconds`
- `mici_comm_provider_errors_total{provider,error_code}`
- `mici_comm_retry_total{provider}`
- `mici_comm_webhook_events_total{provider,status}`
- `mici_comm_queue_depth`
- `mici_comm_dead_letter_total`
- `mici_comm_inbound_unassigned_total`

Logs incluem IDs internos, provider, evento e resultado; nunca tokens, corpos integrais ou dados pessoais desnecessários. Alertar fila crescente, falha persistente, webhooks inválidos anormais, dead-letter e tokens revogados/expirados.

## 4. Testes
### Unitários
Templates/variáveis; roteamento; consentimento/preferências; estados; idempotência; backoff; autorização tenant.

### Integração
PostgreSQL/Celery; outbox; storage; secret manager; webhook; retry/dead-letter.

### Contrato
Payloads normalizados; adapters simulados; assinatura; versões; rate limits e erros.

### Segurança
Tenant A não lê/edita B; replay bloqueado; assinatura inválida rejeitada; SSRF bloqueado; HTML/anexo malicioso tratado; segredo ausente de logs/exceções.

### E2E
Atraso → outbox → worker → sandbox → webhook → histórico; inbound → inbox → triagem → vínculo; aprovação notificada → decisão no MICI → evento de resultado.

## 5. Roadmap
### Fase 0 — Fundação
App Django, tenancy, RBAC, auditoria, Integration/Contact/Message/DeliveryAttempt, migrations e testes.

### Fase 1 — E-mail transacional
Adapter Resend, templates, outbox/Celery, webhooks de status, histórico e teste de envio.

### Fase 2 — Push
Registro de dispositivos, FCM, preferências e tokens revogados/expirados.

### Fase 3 — WhatsApp
Meta Cloud API, templates aprovados, inbound/status webhooks, opt-in, janela de atendimento e limites.

### Fase 4 — E-mail inbound
OAuth Gmail API, escopos mínimos, recebimento suportado, triagem, anexos, renovação/revogação.

### Fase 5 — n8n/parceiros
Eventos, autenticação/assinatura, workflows versionados, callbacks e observabilidade.

### Fase 6 — Evolução
Telegram opcional, escalonamentos, classificação assistida por IA com revisão humana e conectores conforme demanda.

Tenancy, auditoria, outbox e segurança precedem os canais.

## 6. Definition of Done
Código executável; migrations revisadas; testes unitários/integração/isolamento; permissões server-side; auditoria; métricas/logs; documentação; segredos fora do repositório; sandbox/mock; retry/falhas; aceite demonstrável; changelog e ADRs.

## 7. Riscos
| Risco | Mitigação |
|---|---|
| Mudança de cota/preço | adapters e revisão periódica |
| Bloqueio de canal | monitoramento e canal alternativo |
| Vazamento entre tenants | escopo server-side, RLS opcional, testes |
| Duplicidade | outbox, idempotência, dedupe |
| Webhook falso/replay | assinatura, timestamp, dedupe, rate limit |
| Anexo exposto | storage privado e URL temporária |
| Token comprometido | secret manager, rotação, revogação |
| n8n indisponível | desacoplamento |
| Aprovação por mensagem externa | decisão somente no MICI |
| Retenção excessiva | política e expurgo auditável |

## 8. Checklist de produção
1. Confirmar providers e planos vigentes.
2. Configurar domínio, SPF, DKIM e DMARC para e-mail.
3. Concluir configuração/revisão Meta.
4. Definir consentimentos e avisos de privacidade.
5. Aprovar retenção e atendimento LGPD.
6. Fazer revisão/pentest de segurança.
7. Configurar alertas, backups e runbooks.
8. Testar limites, retries e contingência.
9. Aprovar ADRs e responsáveis operacionais.
