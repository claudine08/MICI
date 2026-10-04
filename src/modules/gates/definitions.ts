import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/core/errors";
import { isValidPhase, type CriterionSnapshot } from "./engine";

// GateDefinition (§17.1): configuração de gates por organização. Os gates
// oficiais G0–G8 (§17) são criados como padrão de sistema em toda organização.
// Os critérios das instâncias são copiados na criação do projeto (§15.1).

type Db = Prisma.TransactionClient;

interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

export interface DefaultGateDefinition {
  code: string;
  name: string;
  phase: string;
  description: string;
  criteria: string[];
}

// Mapeamento fase→gate: Gk bloqueia a saída da fase em que sua decisão ocorre
// (F6/F10 não têm gate obrigatório padrão; configurável na UI).
export const DEFAULT_GATE_DEFINITIONS: DefaultGateDefinition[] = [
  {
    code: "G0",
    name: "Oportunidade qualificada",
    phase: "F0",
    description: "Decisão de qualificar a oportunidade (§18, G0).",
    criteria: [
      "Cliente identificado",
      "Oportunidade classificada",
      "Responsável definido",
      "Riscos iniciais registrados",
      "Premissas e exclusões registradas",
      "Sustentabilidade inicial registrada",
    ],
  },
  {
    code: "G1",
    name: "Requisitos suficientes",
    phase: "F1",
    description: "Levantamento completo e DRP criado (§18, G1).",
    criteria: [
      "Reunião inicial realizada",
      "Blocos A–F do levantamento",
      "DRP criado",
      "Requisitos com critérios de aceite",
      "Responsáveis definidos",
      "Evidências vinculadas",
      "Baseline ambiental inicial",
    ],
  },
  {
    code: "G2",
    name: "Viabilidade",
    phase: "F2",
    description: "Viabilidade técnica, financeira e de prazo (§18, G2).",
    criteria: [
      "Viabilidade técnica",
      "Viabilidade financeira",
      "Viabilidade de prazo",
      "Imóvel",
      "Legalidade",
      "Riscos críticos",
      "Capacidade de execução",
      "Sustentabilidade",
      "Medidas de eficiência e impacto",
    ],
  },
  {
    code: "G3",
    name: "Proposta e orçamento",
    phase: "F3",
    description: "Proposta comercial/ técnica aprovada (§18, G3).",
    criteria: [
      "Orçamento",
      "WBS",
      "Premissas",
      "Inclusões",
      "Exclusões",
      "Prazo",
      "Condições",
      "Metas assumidas",
      "Dependências",
      "Aprovação comercial/técnica",
    ],
  },
  {
    code: "G4",
    name: "Contrato e plano de execução",
    phase: "F4",
    description: "Contrato assinado e plano aprovado (§18, G4).",
    criteria: [
      "Contrato",
      "Escopo congelado",
      "Governança",
      "Gerente",
      "Equipe",
      "Fornecedores",
      "Calendário",
      "Plano",
      "Baseline inicial",
      "Kickoff",
      "PSP — Plano de Sustentabilidade do Projeto",
    ],
  },
  {
    code: "G5",
    name: "Projeto liberado para execução",
    phase: "F5",
    description: "Projeto executivo liberado (§18, G5).",
    criteria: [
      "Projeto executivo",
      "Revisão interdisciplinar",
      "Interferências",
      "Requisitos",
      "Engenharia",
      "Segurança",
      "Acessibilidade",
      "Documentação",
      "Sustentabilidade",
      "Pontos de medição",
    ],
  },
  {
    code: "G6",
    name: "Pronto para comissionamento",
    phase: "F7",
    description: "Execução concluída, testes prontos (§18, G6).",
    criteria: [
      "Execução",
      "Instalações",
      "Testes preliminares",
      "Documentação",
      "Pendências críticas",
      "Medições",
      "Sistemas de eficiência testados",
      "Resíduos da obra controlados",
    ],
  },
  {
    code: "G7",
    name: "Aceite operacional",
    phase: "F8",
    description: "Aceite do cliente com garantias e manuais (§18, G7).",
    criteria: [
      "Testes",
      "Treinamento",
      "Manuais",
      "Garantias",
      "As built",
      "Punch list",
      "Licenças aplicáveis",
      "Relatório ambiental",
      "Plano de O&M",
      "Aceite",
    ],
  },
  {
    code: "G8",
    name: "Encerramento",
    phase: "F9",
    description: "Encerramento administrativo do projeto (§18, G8).",
    criteria: [
      "Aceite",
      "Contratos encerrados",
      "Financeiro",
      "Documentos finais",
      "Garantia",
      "Riscos encerrados",
      "Indicadores",
      "Sustentabilidade",
      "Lições aprendidas",
      "Arquivamento",
    ],
  },
];

// Idempotente: cria os gates oficiais da organização se ainda não existirem.
export async function ensureDefaultGateDefinitions(
  db: Db,
  organizationId: string,
  actorId: string
): Promise<void> {
  for (const definition of DEFAULT_GATE_DEFINITIONS) {
    const existing = await db.gateDefinition.findFirst({
      where: { organizationId, code: definition.code, deletedAt: null },
      select: { id: true },
    });
    if (existing) continue;
    await db.gateDefinition.create({
      data: {
        organizationId,
        code: definition.code,
        name: definition.name,
        description: definition.description,
        phase: definition.phase,
        required: true,
        requiresEvidence: true,
        minimumApprovals: 1,
        orderIndex: Number(definition.code.slice(1)),
        isSystem: true,
        createdBy: actorId,
        updatedBy: actorId,
        criteria: {
          create: definition.criteria.map((text, index) => ({
            code: `C${index + 1}`,
            description: text,
            required: true,
            orderIndex: index,
          })),
        },
      },
    });
  }
}

export interface GateDefinitionRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  phase: string;
  required: boolean;
  requiresEvidence: boolean;
  minimumApprovals: number;
  orderIndex: number;
  isSystem: boolean;
  criteria: CriterionSnapshot[];
  activeProjects: number;
}

const definitionInclude = {
  criteria: { orderBy: { orderIndex: "asc" as const } },
} as const;

export async function listGateDefinitions(
  organizationId: string
): Promise<GateDefinitionRow[]> {
  const definitions = await prisma.gateDefinition.findMany({
    where: { organizationId, deletedAt: null },
    include: {
      ...definitionInclude,
      _count: {
        select: { gateInstances: { where: { project: { deletedAt: null } } } },
      },
    },
    orderBy: { orderIndex: "asc" },
  });

  return definitions.map((definition) => ({
    id: definition.id,
    code: definition.code,
    name: definition.name,
    description: definition.description,
    phase: definition.phase,
    required: definition.required,
    requiresEvidence: definition.requiresEvidence,
    minimumApprovals: definition.minimumApprovals,
    orderIndex: definition.orderIndex,
    isSystem: definition.isSystem,
    criteria: definition.criteria.map((criterion) => ({
      code: criterion.code,
      description: criterion.description,
      required: criterion.required,
      orderIndex: criterion.orderIndex,
    })),
    activeProjects: definition._count.gateInstances,
  }));
}

export interface CreateGateDefinitionInput extends ActorContext {
  code: string;
  name: string;
  description?: string;
  phase: string;
  required?: boolean;
  requiresEvidence?: boolean;
  minimumApprovals?: number;
  criteria: { description: string; required?: boolean }[];
}

export async function createGateDefinition(input: CreateGateDefinitionInput) {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{0,15}$/.test(code)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Código do gate inválido (letra inicial, A–Z/0–9/_, até 16 caracteres)."
    );
  }
  if (!isValidPhase(input.phase)) {
    throw new AppError("VALIDATION_ERROR", `Fase inválida: ${input.phase}.`);
  }
  if (input.criteria.length === 0) {
    throw new AppError("VALIDATION_ERROR", "Informe ao menos um critério.");
  }

  const existing = await prisma.gateDefinition.findFirst({
    where: { organizationId: input.organizationId, code, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    throw new AppError("CONFLICT", `Gate "${code}" já existe nesta organização.`);
  }

  const definition = await prisma.gateDefinition.create({
    data: {
      organizationId: input.organizationId,
      code,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      phase: input.phase,
      required: input.required ?? true,
      requiresEvidence: input.requiresEvidence ?? true,
      minimumApprovals: input.minimumApprovals ?? 1,
      orderIndex: 100,
      isSystem: false,
      createdBy: input.actorId,
      updatedBy: input.actorId,
      criteria: {
        create: input.criteria.map((criterion, index) => ({
          code: `C${index + 1}`,
          description: criterion.description.trim(),
          required: criterion.required ?? true,
          orderIndex: index,
        })),
      },
    },
    include: definitionInclude,
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      objectType: "GateDefinition",
      objectId: definition.id,
      action: "CREATE",
      newValue: { code, name: definition.name, phase: definition.phase },
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });

  return definition.id;
}

export interface UpdateGateDefinitionInput extends ActorContext {
  definitionId: string;
  name?: string;
  description?: string | null;
  phase?: string;
  required?: boolean;
  requiresEvidence?: boolean;
  minimumApprovals?: number;
  // Substituição completa dos critérios (sync por código).
  criteria?: { description: string; required?: boolean }[];
}

export async function updateGateDefinition(input: UpdateGateDefinitionInput) {
  const definition = await prisma.gateDefinition.findFirst({
    where: {
      id: input.definitionId,
      organizationId: input.organizationId,
      deletedAt: null,
    },
    include: definitionInclude,
  });
  if (!definition) {
    throw new AppError("NOT_FOUND", "Gate não encontrado nesta organização.");
  }
  if (input.phase && !isValidPhase(input.phase)) {
    throw new AppError("VALIDATION_ERROR", `Fase inválida: ${input.phase}.`);
  }

  const oldCriteria = definition.criteria.map((criterion) => ({
    code: criterion.code,
    description: criterion.description,
    required: criterion.required,
    orderIndex: criterion.orderIndex,
  }));

  const updated = await prisma.$transaction(async (tx) => {
    if (input.criteria) {
      if (input.criteria.length === 0) {
        throw new AppError("VALIDATION_ERROR", "Informe ao menos um critério.");
      }
      await tx.gateCriterion.deleteMany({
        where: { gateDefinitionId: definition.id },
      });
      await tx.gateCriterion.createMany({
        data: input.criteria.map((criterion, index) => ({
          gateDefinitionId: definition.id,
          code: `C${index + 1}`,
          description: criterion.description.trim(),
          required: criterion.required ?? true,
          orderIndex: index,
        })),
      });
    }

    return tx.gateDefinition.update({
      where: { id: definition.id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.phase !== undefined ? { phase: input.phase } : {}),
        ...(input.required !== undefined ? { required: input.required } : {}),
        ...(input.requiresEvidence !== undefined
          ? { requiresEvidence: input.requiresEvidence }
          : {}),
        ...(input.minimumApprovals !== undefined
          ? { minimumApprovals: input.minimumApprovals }
          : {}),
        updatedBy: input.actorId,
        version: { increment: 1 },
      },
      include: definitionInclude,
    });
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      objectType: "GateDefinition",
      objectId: definition.id,
      action: "UPDATE",
      oldValue: {
        name: definition.name,
        phase: definition.phase,
        required: definition.required,
        requiresEvidence: definition.requiresEvidence,
        minimumApprovals: definition.minimumApprovals,
        criteria: oldCriteria,
      },
      newValue: {
        name: updated.name,
        phase: updated.phase,
        required: updated.required,
        requiresEvidence: updated.requiresEvidence,
        minimumApprovals: updated.minimumApprovals,
        criteria: input.criteria
          ? updated.criteria.map((criterion) => ({
              code: criterion.code,
              description: criterion.description,
              required: criterion.required,
              orderIndex: criterion.orderIndex,
            }))
          : undefined,
      },
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });

  return updated.id;
}

export async function deleteGateDefinition(input: ActorContext & { definitionId: string }) {
  const definition = await prisma.gateDefinition.findFirst({
    where: {
      id: input.definitionId,
      organizationId: input.organizationId,
      deletedAt: null,
    },
    select: { id: true, code: true, isSystem: true },
  });
  if (!definition) {
    throw new AppError("NOT_FOUND", "Gate não encontrado nesta organização.");
  }
  if (definition.isSystem) {
    throw new AppError(
      "CONFLICT",
      "Gate do sistema não pode ser removido (desative-o como opcional ou ajuste os critérios)."
    );
  }

  await prisma.gateDefinition.update({
    where: { id: definition.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      objectType: "GateDefinition",
      objectId: definition.id,
      action: "DELETE",
      oldValue: { code: definition.code },
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });

  return { definitionId: definition.id };
}
