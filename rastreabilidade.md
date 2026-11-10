# Rastreabilidade.md — Relação entre Template, Cronograma, Requisitos e Projeto

## Visão geral

O **Projeto** é a entidade central do MICI. Tudo o que é planejado, executado e controlado
(gates, custos, riscos, cronograma, requisitos, qualidade, sustentabilidade) está vinculado a um
projeto dentro de uma organização. Os demais conceitos orbitam o projeto de formas distintas:

- **Template de Projeto** = modelo reutilizável de *configuração* (código, nome, descrição, padrão).
  É selecionado no momento da criação do projeto (`projectTemplateId`) e não pode ser removido
  enquanto houver projeto ativo usando-o. Hoje o template guarda metadados; o snapshot de
  configuração efetivo são as **instâncias de gate** criadas a partir das definições ativas
  da organização (snapshot 15.1), não o conteúdo WBS/checklists.
- **Cronograma** = conjunto de **atividades** (e dependências, calendários, baselines) de um
  projeto. Cada atividade pode ser vinculada a um nó da **WBS** e tem código sequencial por
  projeto (A001...). Pode ser criado manualmente, importado de arquivo MS Project (CSV/XML)
  ou carregado a partir de um **Template de Cronograma** (snapshot normalizado reutilizável).
- **Requisitos** = itens de escopo/compliance de um projeto, com código sequencial por projeto
  (R001...), status, prioridade, categoria, responsável, critérios de aceite, evidências e
  revisões. Podem ser vinculados a um nó da **WBS** (rastreabilidade requisito ↔ atividade).

## Como se conectam

```
Organização
  └── Cliente (opcional) ──┐
  └── Template de Projeto ──┼──► Projeto ──┬── Cronograma (atividades → WBS)
                           │              ├── Requisitos (→ WBS, evidências, revisões)
                           │              ├── Gates (snapshot das definições ativas)
                           │              ├── Custos / Riscos / Qualidade / ...
                           │              └── Cliente (contexto comercial)
  └── Template de Cronograma ─────────────► (importado em um Projeto)
```

### Template de Projeto ↔ Projeto

- Ao criar um projeto, é possível informar `projectTemplateId`. O template deve pertencer à
  mesma organização e não pode estar deletado.
- O template serve como referência de configuração; o projeto guarda o `projectTemplateId`.
- A remoção do template é bloqueada se houver projeto ativo vinculado (integridade referencial).

### Template de Cronograma ↔ Cronograma

- Templates de cronograma (`ScheduleTemplate`) armazenam um **snapshot normalizado** de um
  arquivo MS Project (tarefas + dependências) já parseado.
- Na importação, o snapshot é aplicado ao projeto escolhido, criando as atividades e
  dependências no cronograma daquele projeto.
- É um reuso de **cronograma**, não de projeto: não cria projeto, apenas alimenta o
  cronograma de um projeto existente.

### Cronograma ↔ Requisitos (via WBS)

- Tanto atividades do cronograma quanto requisitos podem referenciar um `wbsNodeId` do
  mesmo projeto.
- Essa é a ponte de rastreabilidade: um requisito (o que deve ser entregue) pode ser
  associado ao nó WBS que, por sua vez, tem atividades (como será entregue) no cronograma.
- Requisitos também possuem evidências e revisões, permitindo rastrear a validação do
  cumprimento.

### Projeto ↔ Cliente

- Um projeto pode ter um `clientId` (cliente do portfólio). O cliente fornece contexto
  comercial; não é obrigatório (projetos internos podem não ter cliente).

## Regras de negócio relevantes

- Códigos são únicos por escopo: projeto por organização, requisito por projeto,
  atividade por projeto, template por organização.
- Gates são snapshot no momento da criação do projeto: alterações futuras nas definições
  não afetam projetos existentes.
- Template de cronograma é imutável como snapshot; ao ser aplicado, gera cópias no
  cronograma do projeto (não referência dinâmica).
- Requisitos não podem ser concluídos sem critérios de aceite e evidências (BR-008).

## Perguntas e respostas

### 1) Como configurar o template para cada tipo de projeto (reforma, obra nova, expansão)?

Hoje o **Template de Projeto** é um modelo genérico por organização (código, nome, descrição,
`isDefault`). Não existe um campo `projectType` no template nem vínculo automático entre
`projectType` do projeto e template. Na prática, a configuração é **manual/selecionada na criação
do projeto**:

- Crie templates distintos, ex.: `TPL-REFORMA`, `TPL-OBRA-NOVA`, `TPL-EXPANSAO`.
- Ao criar o projeto, informe `projectType` (texto livre, ex.: "Reforma", "Obra Nova",
  "Expansão") **e** selecione o `projectTemplateId` correspondente.
- Um template pode ser marcado como `isDefault` (apenas um por organização) para ser sugerido
  como padrão.
- As **instâncias de gate** do projeto são criadas a partir das **definições ativas da
  organização** (snapshot 15.1), não do template. Ou seja, o template não carrega gates; os
  gates vêm das definições da organização no momento da criação do projeto.

> Em resumo: o "tipo de projeto" é um rótulo (`projectType`) + a escolha manual do template
> adequado. Não há automação por tipo hoje.

### 2) A WBS pode ser reconfigurada para cada tipo de projeto?

Sim, porque a **WBS é por projeto** (não compartilhada entre projetos). Cada projeto tem sua
própria árvore WBS, que pode ser:

- Criada manualmente (nós, subárvores, reordenação, mover/duplicar).
- **Importada** de um arquivo (WBS import) com validação e versionamento.
- **Duplicada** a partir de um nó/subárvore existente (com códigos novos).
- **Versionada** (snapshot `WBSVersion`), com import registrando a versão anterior.

Não existe uma entidade "Template de WBS" separada. Para reutilizar estruturas por tipo de
projeto, o caminho hoje é:

- Manter um projeto "modelo" por tipo (ex.: Projeto Modelo Reforma) com a WBS pronta.
- Duplicar a subárvore WBS desse projeto para o novo projeto (ação de duplicar nó).
- Ou exportar/importar a WBS via arquivo.

> Em resumo: a WBS é totalmente configurável por projeto e reutilizável por duplicação/importação,
> mas não há template de WBS automático por tipo de projeto.

### 3) Como os requisitos são integrados ao projeto?

Um **Requisito** sempre pertence a um projeto (`projectId` obrigatório). A integração ocorre por:

- **Criação no escopo do projeto**: `createRequirement` valida que o projeto existe na
  organização; código sequencial por projeto (R001, R002...).
- **Vínculo com WBS**: `wbsNodeId` opcional liga o requisito a um nó da WBS do mesmo projeto
  (rastreabilidade requisito ↔ atividade/entrega).
- **Responsável**: `ownerId` deve ser membro ativo da organização.
- **Evidências e revisões**: cada alteração cria `RequirementRevision` (snapshot) + auditoria
  + evento de domínio; evidências podem ser adicionadas/removidas.
- **Regras de negócio**: requisitos regulatórios (com fonte e validade) bloqueiam criação/
  transição inválida; conclusão (`COMPLETED`) exige critérios de aceite e evidências (BR-008).
- **Status**: transições controladas (`DRAFT → ACTIVE → COMPLETED/CANCELLED`).
- **Carimbo de revisão**: `lastReviewedAt` (DRP).

> Em resumo: requisitos são filhos do projeto, podem ser ancorados em nós da WBS, carregam
> histórico (revisões/evidências) e alimentam a rastreabilidade da entrega.

## Diagrama (Mermaid)

```mermaid
flowchart TD
    ORG[Organização]
    CLIENT[Cliente (opcional)]
    TPL[Template de Projeto\n(código/nome/descrição/isDefault)]
    PT[projectType\n(texto livre: Reforma, Obra Nova, Expansão)]
    PROJ[Projeto\n(code, name, status, currentPhase)]
    GATES[Instâncias de Gate\n(snapshot das definições ativas)]
    WBS[WBS do Projeto\n(nós, subárvores, versões)]
    REQ[Requisitos\n(R001... por projeto)]
    EVID[Evidências + Revisões]
    CRON[Cronograma\n(atividades → WBS)]
    TPLCRON[Template de Cronograma\n(snapshot MS Project)]
    IMP[Importação/Duplicação\nWBS ou Cronograma]

    ORG --> CLIENT
    ORG --> TPL
    ORG --> PT
    TPL -. selecionado manualmente .-> PROJ
    PT -. rótulo .-> PROJ
    CLIENT -. clientId .-> PROJ
    PROJ --> GATES
    PROJ --> WBS
    PROJ --> REQ
    PROJ --> CRON
    REQ -->|wbsNodeId| WBS
    CRON -->|wbsNodeId| WBS
    REQ --> EVID
    TPLCRON -->|snapshot aplicado| CRON
    IMP --> WBS
    IMP --> CRON
```

## Exemplo visual — Projeto "Restauração" do cliente Lusos Restaurante

### Cenário (exemplo)

- **Cliente**: Lusos Restaurante (`CLI001`)
- **Projeto**: `PRJ-REST-LUSOS` — "Restauração da Cozinha Industrial Lusos" (projectType = "Reforma")
- **Template selecionado**: `TPL-REFORMA` (manual)
- **WBS** (por projeto): `1` Cozinha Industrial (SUMMARY); `1.1` Demolição; `1.2` Instalações; `1.3` Acabamento.
- **Requisitos** (por projeto, vínculo WBS): `R001` Coifa/exaustão → `1.2`; `R002` Piso antiderrapante → `1.3`; `R003` Laudo de vistoria (compliance) → `1.3`.
- **Cronograma** (atividades, vínculo WBS): `A001` Demolição → `1.1`; `A002` Instalação → `1.2`; `A003` Assentamento piso → `1.3`; `A004` Vistoria final → `1.3`.
- **Gates**: instâncias criadas a partir das definições ativas da organização (snapshot).

### Diagrama (exemplo)

```mermaid
flowchart LR
    C[Cliente: Lusos Restaurante (CLI001)]
    P[Projeto: PRJ-REST-LUSOS (Reforma)]
    T[Template: TPL-REFORMA (manual)]
    W1[1 Cozinha Industrial (SUMMARY)]
    W11[1.1 Demolição (WP)]
    W12[1.2 Instalações (WP)]
    W13[1.3 Acabamento (WP)]
    R1[R001 Coifa/exaustão]
    R2[R002 Piso antiderrapante]
    R3[R003 Laudo vistoria]
    A1[A001 Demolição]
    A2[A002 Instalação]
    A3[A003 Assentamento piso]
    A4[A004 Vistoria final]
    G[Instâncias de Gate (snapshot org)]

    C --> P
    T -. selecionado .-> P
    P --> W1
    W1 --> W11
    W1 --> W12
    W1 --> W13
    P --> R1
    P --> R2
    P --> R3
    R1 -->|wbsNodeId| W12
    R2 -->|wbsNodeId| W13
    R3 -->|wbsNodeId| W13
    P --> A1
    P --> A2
    P --> A3
    P --> A4
    A1 -->|wbsNodeId| W11
    A2 -->|wbsNodeId| W12
    A3 -->|wbsNodeId| W13
    A4 -->|wbsNodeId| W13
    P --> G
```

### Tabela de rastreabilidade (exemplo)

| Tipo | Código | Nome | Vínculo WBS | Observação |
|---|---|---|---|---|
| Cliente | CLI001 | Lusos Restaurante | — | Contexto comercial |
| Projeto | PRJ-REST-LUSOS | Restauração Cozinha Industrial | — | projectType=Reforma, template TPL-REFORMA |
| WBS | 1 | Cozinha Industrial | (raiz) | SUMMARY |
| WBS | 1.1 | Demolição e remoção | 1 | WP |
| WBS | 1.2 | Instalações | 1 | WP |
| WBS | 1.3 | Acabamento e entrega | 1 | WP |
| Requisito | R001 | Coifa com exaustão | 1.2 | Status ACTIVE |
| Requisito | R002 | Piso antiderrapante | 1.3 | Status ACTIVE |
| Requisito | R003 | Laudo de vistoria | 1.3 | Compliance, com fonte/validade |
| Atividade | A001 | Demolição | 1.1 | TASK |
| Atividade | A002 | Instalação elétrica/hidráulica | 1.2 | TASK |
| Atividade | A003 | Assentamento de piso | 1.3 | TASK |
| Atividade | A004 | Vistoria final | 1.3 | MILESTONE |
| Gate | (instâncias) | — | — | Snapshot das definições ativas da organização |

## Endpoint de rastreabilidade (API)

`GET /api/v1/projects/{projectId}/traceability` (permissão `PROJECT:VIEW`) retorna a
rastreabilidade requisito ↔ atividade via WBS, enriquecida:

```json
{
  "traceability": [
    {
      "requirement": {
        "id": "...",
        "code": "R001",
        "description": "expandir a operação para 2000 ref/dia",
        "status": "ACTIVE",
        "evidenceCount": 2
      },
      "wbs": { "id": "...", "code": "1.2", "name": "Instalações" },
      "activities": [
        { "id": "...", "code": "A002", "name": "Instalação elétrica/hidráulica", "status": "IN_PROGRESS", "physicalProgress": 40 }
      ]
    }
  ],
  "unlinkedActivities": [
    { "id": "...", "code": "A005", "name": "Atividade sem WBS", "status": "NOT_STARTED", "physicalProgress": 0 }
  ],
  "summary": {
    "totalRequirements": 3,
    "totalActivities": 4,
    "linkedRequirements": 2,
    "linkedActivities": 2,
    "unlinkedRequirements": 1,
    "unlinkedActivities": 2
  }
}
```

- `evidenceCount`: número de evidências do requisito (BR-008).
- `activities`: atividades do cronograma que compartilham o mesmo `wbsNodeId` do requisito,
  com `status` e `physicalProgress`.
- `unlinkedActivities`: atividades sem `wbsNodeId` (órfãs) — não vinculadas a nenhum requisito.
- `summary`: totais e contagens de vinculados/órfãos para dashboards.

A lógica está em `src/modules/requirements/traceability.ts` (`getProjectTraceability`),
testada em `tests/integration/traceability.test.ts`.

## Resumo em uma frase

> O **projeto** é o contêiner central; o **template de projeto** é um modelo reutilizável de
> configuração; o **cronograma** planeja *como* executar (atividades ligadas à WBS); os
> **requisitos** definem *o que* deve ser entregue (também ligados à WBS); e o **template de
> cronograma** é um atalho para reutilizar um cronograma inteiro em outro projeto.