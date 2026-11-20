# Reporte de Campo via WhatsApp (E12+)

## Objetivo
Permitir que a equipe de campo envie reportes diários (avanço, fotos, restrições, ocorrências) diretamente pelo WhatsApp, sem precisar abrir o MICI no navegador, mantendo rastreabilidade, tenant isolation e auditoria.

## Premissas
- WhatsApp é o canal padrão da equipe de campo.
- O MICI já possui módulo de Integrações (E20) com fila `job_queue`, outbox, WhatsApp Cloud API (Meta) e crons.
- Fotos e medições já existem no módulo de Campo (E12).

## Fluxo proposto
1. Usuário autorizado vincula seu número (E.164) em `/perfil` (já existe).
2. No WhatsApp, o usuário envia mensagem para o número oficial do MICI (template "Reporte de Campo").
3. O webhook inbound (`/api/v1/integrations/whatsapp/inbound`) recebe a mensagem e identifica o usuário pelo número.
4. O MICI responde com menu interativo (botões/lista):
   - "Novo diário de obra"
   - "Registrar avanço"
   - "Registrar restrição"
   - "Enviar foto"
   - "Consultar pendências"
5. O usuário responde passo a passo (wizard conversacional); cada resposta cria/atualiza entidades do módulo de Campo com `source = WHATSAPP`.
6. Fotos enviadas no chat são baixadas via Media API da Meta, validadas (MIME + 4 MB) e salvas como `PhotoEvidence` vinculadas ao diário/atividade.
7. Ao final, o MICI confirma com resumo e link para o reporte no app.

## Entidades / alterações
- `FieldDiary`, `FieldTask`, `Constraint`, `ProgressMeasurement`, `PhotoEvidence`: adicionar `source` (APP | WHATSAPP | OFFLINE) e `whatsappMessageId` (opcional).
- Nova tabela `WhatsAppConversation` (state machine do wizard): `userId`, `projectId`, `step`, `payload Json`, `expiresAt`.
- Auditoria de todas as ações com `actor = user` e `channel = WHATSAPP`.

## API / integrações
- `POST /api/v1/integrations/whatsapp/inbound` (webhook Meta, validação de assinatura).
- `POST /api/v1/integrations/whatsapp/send` (já existe) para respostas/notificações.
- Reuso de `job_queue` para processamento assíncrono (handler `whatsapp.inbound`).
- Rate limit por número e por projeto.

## Segurança
- Validação de assinatura do webhook (X-Hub-Signature-256).
- Vínculo número↔usuário↔organização; só membros ACTIVE com permissão FIELD:CREATE.
- Números não cadastrados recebem resposta padrão "não autorizado" e são logados.
- Dados sensíveis nunca enviados de volta em texto livre (apenas resumos e links).

## UX / templates Meta
- Template aprovado "mici_field_report" para iniciar conversa (janela de 24h).
- Mensagens interativas (botões/listas) dentro da janela.
- Fallback para texto livre com parsing simples (ex.: "avanço A001 50%").

## Roadmap sugerido
- Fatia 1: inbound webhook + identificação + menu + criação de diário via WhatsApp.
- Fatia 2: avanço e restrições via WhatsApp + confirmação.
- Fatia 3: upload de foto via WhatsApp + vinculação.
- Fatia 4: consultas (pendências, status) + notificações proativas (lembrete de diário).
- Fatia 5: parsing de texto livre + analytics de uso.

## Critérios de aceite
- Usuário cadastrado consegue criar diário completo pelo WhatsApp em < 2 min.
- Fotos chegam ao MICI com hash e vínculo correto.
- Isolamento de tenant garantido (número de org A não acessa org B).
- Logs/auditoria permitem rastrear origem WhatsApp.
- Funciona offline parcial: se o app estiver offline, o reporte via WhatsApp ainda cria o diário no servidor.