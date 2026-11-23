# MICI — Central de Comunicação e Integrações
## Product Requirements Document (PRD)

**Versão:** 1.0 | **Data-base:** novembro de 2026 | **Status:** proposta para revisão técnica.

## 1. Visão
A Central permite que usuários e processos autorizados do MICI troquem informações com clientes, fornecedores, equipes de obra e sistemas externos. Centraliza configuração, envio, recebimento, notificações, histórico e automações, sempre vinculados ao tenant, projeto e objeto de negócio quando aplicável.

Não é apenas um disparador: é um serviço transversal com rastreabilidade e governança.

## 2. Objetivos
- Enviar notificações por e-mail, WhatsApp e push.
- Receber mensagens/respostas quando o provider e as permissões permitirem.
- Associar mensagens a projetos, tarefas, documentos, ocorrências, aprovações, compras e riscos.
- Integrar aplicações externas por APIs e webhooks.
- Automatizar processos com Celery e, opcionalmente, n8n.
- Configurar providers por organização.
- Preservar histórico, evidências, consentimento, falhas e status.
- Evitar duplicidade e execução de ações críticas sem aprovação.

## 3. Não objetivos do MVP
- Substituir Gmail, Outlook, WhatsApp ou outros aplicativos.
- Disparos promocionais em massa.
- Chatbot autônomo com autoridade para aprovar, contratar, alterar baseline ou orçamento.
- Sincronizar indiscriminadamente dados pessoais.
- Garantir entrega/leitura quando o canal não fornece confirmação.
- Usar n8n como fonte primária dos dados ou camada de autorização.

## 4. Personas
| Persona | Necessidade |
|---|---|
| Administrador da organização | Configurar providers, credenciais e políticas |
| Gerente de projeto | Comunicar atrasos, aprovações, riscos e decisões |
| Equipe de campo | Receber tarefas/alertas e enviar evidências |
| Compras | Solicitar cotações e registrar propostas |
| Cliente/fornecedor | Receber comunicados e responder solicitações |
| PMO/auditor | Consultar histórico e trilha de auditoria |

## 5. Escopo funcional
### 5.1 Canais
- E-mail transacional de saída.
- E-mail inbound por integração autorizada (Gmail API ou mecanismo suportado).
- WhatsApp via Meta Cloud API.
- Push via Firebase Cloud Messaging.
- Telegram Bot API opcional.
- APIs/webhooks para terceiros.
- n8n opcional para orquestração.

### 5.2 Outbox
Persistir intenção antes do envio. Registrar tenant, canal, provider, destinatário, template/versão, contexto de projeto/objeto, prioridade, status, idempotency key, tentativas, identificador externo, datas e erro sanitizado.

### 5.3 Inbox
Registrar provider, ID externo, remetente, timestamps, conteúdo/metadados permitidos, anexos em object storage, tenant resolvido com segurança, contexto e estado de triagem. Mensagens ambíguas vão para triagem; não associar automaticamente a projeto.

### 5.4 Eventos notificáveis
Tarefa atribuída/vencida; marco próximo/atrasado; aprovação solicitada/concluída; RFI recebido; proposta recebida; pedido de compra atualizado; ocorrência de qualidade/segurança; risco elevado; mudança submetida; documento publicado; evidência de campo recebida; comissionamento pendente.

### 5.5 Templates
Código estável, canal, idioma, assunto/corpo, variáveis permitidas, versão, estado, autor e aprovação quando necessária. Templates WhatsApp dependem de aprovação e regras Meta; não presumir aprovação.

### 5.6 Preferências e consentimento
Preferências por usuário/categoria/canal e horários de silêncio, respeitando alertas obrigatórios. Registrar opt-in/consentimento quando aplicável, finalidade, origem, data e revogação. A base legal deve ser avaliada por finalidade; consentimento não é necessariamente a única base legal.

### 5.7 Administração de integrações
Ativar/desativar por tenant, testar conectividade, conceder escopos mínimos, consultar saúde, rotacionar/revogar credenciais, configurar limites, eventos e retenção.

## 6. Requisitos funcionais
| ID | Requisito | Prioridade |
|---|---|---|
| COM-FR-001 | Configurar providers por organização | Must |
| COM-FR-002 | Enfileirar sem bloquear requisição web | Must |
| COM-FR-003 | Persistir outbox antes do envio | Must |
| COM-FR-004 | Registrar status e ID externo | Must |
| COM-FR-005 | Idempotência de envio | Must |
| COM-FR-006 | Validar webhooks de status | Must |
| COM-FR-007 | Receber inbound nos canais habilitados | Should |
| COM-FR-008 | Associar a projeto/objeto com regras seguras | Must |
| COM-FR-009 | Templates versionados | Must |
| COM-FR-010 | Preferências e consentimentos | Must |
| COM-FR-011 | Push por dispositivo | Should |
| COM-FR-012 | Integração n8n autenticada | Should |
| COM-FR-013 | Histórico por projeto/contato/período | Must |
| COM-FR-014 | Retry limitado para falhas transitórias | Must |
| COM-FR-015 | Dead-letter e ação administrativa | Should |
| COM-FR-016 | Exportação de auditoria autorizada | Should |
| COM-FR-017 | Regras de roteamento por evento | Should |
| COM-FR-018 | Anexos em storage privado | Must |

## 7. Requisitos não funcionais
Segurança TLS/segredos/RBAC/assinaturas; isolamento multi-tenant; outbox, retries e deduplicação; logs estruturados e correlation ID; envio assíncrono; minimização e retenção LGPD; adapters substituíveis; telas acessíveis; falha de provider não pode indisponibilizar o núcleo MICI.

## 8. Regras de negócio
1. Toda mensagem pertence a um tenant.
2. Backend sempre valida autorização; UI não é controle de segurança.
3. Integração não altera baseline, orçamento aprovado, contrato, gate ou aprovação.
4. Resposta externa pode criar solicitação/tarefa pendente, nunca aprovar por interpretação livre.
5. Anexos usam URL temporária ou download autenticado.
6. Retry não duplica mensagem.
7. `sent` significa aceito/enviado conforme semântica do provider, não necessariamente entregue/lido.
8. Falha definitiva deve ser visível ao responsável.
9. Revogar credencial interrompe chamadas e invalida tokens aplicáveis.

## 9. Fluxos
### Atraso de atividade
Evento `schedule.activity.overdue` → resolver destinatários/preferências → criar outbox → worker envia → provider retorna ID → webhook atualiza status → histórico no projeto.

### Aprovação
Workflow cria `approval.requested` → notificação com link autenticado → aprovador decide dentro do MICI → evento `approval.decided` → interessados notificados. Mensagem externa não equivale a aprovação.

### Proposta de fornecedor
Inbound → validar e armazenar anexo → identificar processo por referência inequívoca → se ambíguo, triagem → usuário autorizado vincula → workflow de avaliação.

## 10. Critérios de aceite MVP
- Tenant configura provider sem expor segredo.
- Evento MICI gera e-mail assíncrono persistido.
- Repetição de comando não duplica envio.
- Webhook inválido é rejeitado; válido atualiza status.
- Tenant A não consulta dados do tenant B.
- Falha de provider não bloqueia o núcleo.
- Logs têm correlation ID e não expõem tokens/conteúdo sensível.
- Ação crítica exige confirmação no MICI.

## 11. Evolução
Sincronização avançada com ERP; classificação assistida por IA com revisão humana; conversação unificada; regras de SLA; campanhas somente após avaliação jurídica e de produto; novos conectores conforme demanda.

## 12. Métricas
Mensagens criadas/aceitas/entregues/lidas quando disponível; latência; falhas por provider; retries/dead-letter; inbound sem vínculo; integrações ativas e última sincronização.
