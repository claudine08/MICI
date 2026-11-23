# MICI — Central de Comunicação e Integrações

**Pacote documental:** 1.0 | **Data-base:** novembro de 2026 | **Status:** proposta para revisão e incorporação à documentação oficial.

## Objetivo
Especificar o módulo transversal que conecta o MICI a e-mail, WhatsApp, push mobile, Telegram, APIs, webhooks e automações, preservando multi-tenancy, RBAC, auditoria e rastreabilidade por projeto.

## Arquivos
1. `MICI_Comunicacao_PRD.md` — visão, escopo, requisitos e aceite.
2. `MICI_Comunicacao_Arquitetura.md` — arquitetura Django/Python e componentes.
3. `MICI_Comunicacao_Modelo_Dados.md` — entidades PostgreSQL.
4. `MICI_Comunicacao_APIs_Webhooks.md` — APIs, eventos e webhooks.
5. `MICI_Comunicacao_Fluxos_n8n.md` — fluxos de automação.
6. `MICI_Comunicacao_Implementacao.md` — segurança, testes e roadmap.

## Decisões principais
- Monólito modular Django + Django REST Framework; PostgreSQL como fonte de verdade.
- Celery + Redis para tarefas assíncronas; object storage para anexos.
- Adapters para trocar providers sem reescrever regras de negócio.
- Credenciais por referência segura; nunca em código, logs ou payloads.
- n8n opcional: orquestra integrações, mas não substitui RBAC, workflow, auditoria ou persistência MICI.
- Webhooks autenticados, validados, idempotentes e processados em background.
- Ações críticas continuam ocorrendo dentro dos workflows autorizados do MICI.

## Providers de referência
| Necessidade | Provider | Observação |
|---|---|---|
| E-mail de saída | Resend | API HTTP; validar plano, limites e domínio |
| Recebimento de e-mail | Gmail API | OAuth 2.0 e escopos mínimos |
| WhatsApp | Meta WhatsApp Cloud API | API oficial; templates, opt-in, políticas e cobrança |
| Push | Firebase Cloud Messaging | Tokens por dispositivo; entrega não garantida |
| Mensageria opcional | Telegram Bot API | Complementar, não substitui canais corporativos |
| Automação | n8n self-hosted | Opcional e desacoplado |

**Atenção:** gratuito não significa ilimitado. Cotas, preços, políticas e requisitos dos fornecedores mudam. Confirmar condições nos portais oficiais antes da ativação.

## Compatibilidade com o MICI
Respeitar multi-tenancy, autorização contextual por organização/projeto/objeto, baseline imutável, workflows de mudança, histórico auditável, object storage e rastreabilidade requisito → projeto → execução → evidência → decisão.

## Incorporação
Este pacote é uma especificação de referência, não uma migration pronta. Revisar nomes reais do schema, aprovar ADRs, privacidade, retenção e segurança antes da implementação.
