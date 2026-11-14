# MICI — Central de Comunicação e Integrações
## Fluxos de Automação n8n

**Versão:** 1.0 | **Data-base:** novembro de 2026

## 1. Papel do n8n
n8n é orquestrador opcional. Não substitui PostgreSQL, RBAC, workflows oficiais, auditoria ou outbox. Recebe eventos minimizados e chama APIs autenticadas; MICI revalida autorização e regras.

## 2. Topologia
```text
MICI PostgreSQL → Transactional Outbox → Celery Dispatcher
 → Webhook n8n → Workflow → Serviços externos
                         ↘ callback/API MICI
```
Para comunicação simples, preferir adapters MICI/Celery. Usar n8n para integração multi-sistema ou automação específica.

## 3. Segurança
Self-hosted em rede controlada; TLS; credenciais criptografadas; autenticação MICI↔n8n; credenciais separadas por tenant/workflow; editor não exposto sem controles fortes; restringir nodes comunitários/código arbitrário; bloquear SSRF e acesso a redes internas; limites de execução; pruning de histórico; payload mínimo; workflow e correlation ID registrados; ambientes separados.

## 4. Payload comum
```json
{
  "event_id": "uuid",
  "event_type": "schedule.activity.overdue",
  "event_version": 1,
  "occurred_at": "2026-11-05T14:30:00Z",
  "organization_id": "uuid",
  "project_id": "uuid",
  "subject": {"type": "schedule_activity", "id": "uuid"},
  "data": {"activity_code": "WBS-4.2.1"},
  "correlation_id": "uuid"
}
```
Não incluir segredos, anexos binários, listas extensas de contatos ou conteúdo sensível. Consultar detalhes por API MICI com escopo restrito.

## 5. Fluxo A — Notificar atraso
1. Webhook Trigger.
2. Validar estrutura e versão.
3. Deduplicar `event_id`.
4. Consultar atividade na API MICI.
5. Obter destinatários autorizados via MICI.
6. Switch por canal permitido.
7. Solicitar envio em `/communications/messages`.
8. Registrar ID/correlation ID.
9. Deixar retry sob controle MICI; evitar retry concorrente independente.

## 6. Fluxo B — Proposta de fornecedor
1. Receber evento inbound.
2. Validar autenticação/assinatura.
3. Consultar mensagem e anexos por API.
4. Verificar referência inequívoca à compra.
5. Se ambíguo, criar item de triagem.
6. Solicitar vínculo pendente.
7. Notificar comprador.
8. Validação humana no MICI.
9. Só então encaminhar ao workflow de avaliação.

## 7. Fluxo C — Solicitação de cotação
Evento `procurement.quote.requested` → consultar pacote aprovado e fornecedores autorizados → gerar template → enviar e-mail → registrar IDs → receber resposta → vincular com revisão humana. Compartilhar somente documentos liberados e links seguros.

## 8. Fluxo D — Ocorrência de campo
Evento `field.occurrence.created` → consultar severidade/responsáveis → aplicar matriz de roteamento MICI → notificar → escalonar se não houver reconhecimento → registrar reconhecimento no MICI. Entrega da mensagem não equivale a reconhecimento.

## 9. Fluxo E — Documento revisado
Evento `document.revision.published` → verificar permissões → notificar sem anexar documento confidencial → link autenticado/temporário → registrar mensagem e revisão.

## 10. Erros
Validação: encerrar; 401/403: parar e corrigir; 429: respeitar `Retry-After`; 5xx/timeouts: retry limitado; duplicado: sucesso idempotente; falha permanente: dead-letter/triagem MICI.

## 11. Versionamento
Workflows exportados para Git sem credenciais; promoção dev→homologação→produção. Documentar ID/nome, evento, versão de contrato, credenciais lógicas, retry, timeout, responsável, testes e rollback.

## 12. Aceite
Evento repetido não duplica comunicação; workflow não acessa outro tenant; credenciais não aparecem em logs/exportação; falha n8n não bloqueia MICI; execução correlacionável; ações críticas validadas no MICI; desativação interrompe novas execuções.
