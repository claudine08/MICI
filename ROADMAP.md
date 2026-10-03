# ROADMAP — MICI SaaS

Fonte: spec §§99–101 (Releases, Backlog de Implementação, Critérios de Aceite do MVP).
Status: ⬜ não iniciado · 🟦 em andamento · ✅ concluído.

## Releases (produto)

| Release | Escopo |
|---|---|
| **Release 1** | Projetos, templates, requisitos, WBS, gates, cronograma básico, orçamento, físico, documentos, riscos, mudanças, qualidade, dashboards, auditoria |
| **Release 2** | Suprimentos, contratos, RFI, reuniões, comissionamento, garantia, importação/exportação avançada, planejamento curto prazo |
| **Release 3** | EVM avançado, portfólio, ERP, BIM/CDE, cenários, análise quantitativa de risco |
| **Release 4** | IA, busca semântica, automações, IoT, telemetria, visão computacional |

## Épicos (E01–E18) e status

| Épico | Escopo resumido | Status |
|---|---|---|
| **E01 Platform Foundation** | Base do sistema, CI, observabilidade | 🟦 Fase 0 (ver abaixo) |
| **E02 Identity** | Usuário↔organização, roles, permissions, tenant isolation | 🟦 Fase 0/1 ✅ (OIDC/Keycloak no backlog) |
| **E03 Project** | Organization, Client, Project, ProjectTemplate, clonagem | ⬜ |
| **E04 Requirements** | Requisito, versionamento, vínculo WBS/evidência, DRP | ⬜ |
| **E05 WBS** | Árvore, reordenar, importar/exportar, versionar | ⬜ |
| **E06 Gates** | GateDefinition/Instance, critérios, aprovação, bloqueio (BR-001/002), auditoria | ⬜ |
| **E07 Schedule** | Atividades, dependências, calendário, baseline, forecast, caminho crítico | ⬜ |
| **E08 Cost** | Budget, CostItem, Commitment, Actual, Forecast, EVM | ⬜ |
| **E09 Documents** | Upload, revisão, aprovação, release, link de objetos | ⬜ |
| **E10 Risk** | Risk register, matriz, resposta, risco residual | ⬜ |
| **E11 Change** | Request, impacto, aprovação, baseline revision, implementation | ⬜ |
| **E12 Field** | Diário, foto, tarefa, avanço, restrição, mobile/PWA | ⬜ |
| **E13 Quality** | Checklist, inspeção, NCR, ação corretiva, punch list | ⬜ |
| **E14 Procurement** | Purchase request, cotação, comparação, aprovação, PO, recebimento | ⬜ |
| **E15 Commissioning** | Plano, teste, reteste, aceite | ⬜ |
| **E16 Sustainability** | PSP, baseline, metas, medições, resíduo, relatório ambiental | ⬜ |
| **E17 Dashboard** | Portfólio, executivo, projeto, campo | ⬜ |
| **E18 AI** | AI Gateway, prompts, extração, resumo diário, classificação, busca | ⬜ |

> Desvio registrado (ADR-014): a spec original previa Django + React
> (E01-US01/US02); a decisão aprovada de arquitetura é **Next.js full-stack**
> no mesmo monolito modular — os épicos permanecem válidos, o stack muda.

## Plano de execução por fases

### Fase 0 — Foundation ✅ (esta entrega)

- [x] Scaffold Next 16 + TypeScript + Tailwind 4 + configs (lint/typecheck/format/CI)
- [x] Prisma 7 + schema base: tenancy, usuários, memberships, papéis,
      permissões, auditoria (append-only), outbox `domain_events`, `job_queue`
- [x] Migration inicial aplicada + seed idempotente (catálogo 200 permissões,
      18 papéis/organização, org demo, 5 usuários demo)
- [x] Auth.js v5 (JWT + scrypt), página `/entrar`, sessão
- [x] Contexto de tenant (`organization_id` via cookie validado) + API
      `/api/v1/session/context` (GET/POST) + `/api/v1/organizations` +
      `/api/v1/health`
- [x] Shell do app (sidebar/topbar/org switcher) + `/painel`
- [x] RBAC com matriz 18×25×8 + `can()` + testes unitários (15 testes)
- [x] Contrato de erro único da API (códigos + status + correlation_id)
- [x] GitHub Actions CI (lint → typecheck → test → build)
- [x] README (runbook), ROADMAP, ADR-014/ADR-015

### Fase 1 — Identity/Tenancy (E02) ✅

- [x] UI de administração: usuários, convites, papéis e permissões
      (`/administracao/usuarios`, `/administracao/papeis`)
- [x] Troca de organização completa + guarda de rotas
      (`/selecionar-organizacao` + guards em layout/entrar)
- [x] Testes automatizados de isolamento de tenant no CI
      (13 testes em `tests/integration/tenant-isolation.test.ts` + Postgres service)
- [x] Trilha de auditoria visível (`/administracao/auditoria` com filtros e
      histórico por objeto)
- [x] Salvaguardas: auto-bloqueio de edição da própria membresia; proteção do
      último ADMIN ativo; papéis do sistema imutáveis

### Fase 2 — Portfólio e Projetos (E03) + Gates (E06)

- [ ] CRUD Project/Client/ProjectTemplate + clonagem de template
- [ ] GateDefinition/GateInstance com critérios e evidências
- [ ] Bloqueio BR-001/BR-002 + auditoria de decisão
- [ ] Navegação completa do shell (rotas de Portfólio/Administração)

### Fase 3 — Requirements/DRP (E04) + WBS (E05)

- [ ] Requisitos versionados, vínculos com WBS e evidências
- [ ] Geração de DRP
- [ ] Árvore de WBS com importação/exportação

### Fase 4 — Planejamento e Custos (E07, E08), Documentos (E09)

- [ ] Cronograma + baseline + forecast
- [ ] Orçamento, commitments, actuals
- [ ] Documentos com revisão e aprovação

### Fase 5+ — Releases 1→4

Executar épicos E10–E18 conforme prioridade de Release 1, depois Releases 2–4.

## Critérios de aceite do MVP (§101)

O MVP é aceito quando um projeto real executar o ciclo completo:

```text
Oportunidade → Requisitos → Orçamento → Projeto → Baseline → Execução →
Avanço → Custo → Risco → Mudança → Qualidade → Comissionamento →
Aceite → Encerramento
```

Além disso: múltiplos projetos, permissões, histórico, origem de indicadores,
exportação, backup, auditoria e isolamento de tenants.

Cenário E2E automatizado: §102 (34 passos, de "criar tenant" a "aprovar G8").

## Gates do projeto de implantação (referência)

G0 Oportunidade qualificada · G1 Requisitos suficientes · G2 Viabilidade ·
G3 Proposta/orçamento · G4 Contrato e plano · G5 Projeto liberado ·
G6 Pronto para comissionamento · G7 Aceite operacional · G8 Encerramento
