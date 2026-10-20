import { prisma } from "@/lib/prisma";
import { getEffectiveRiskMatrix } from "@/modules/risk/selectors";

// Matriz de risco configurável por organização (E10-US02, §32). Sem registro,
// vale a matriz default do motor (labels 1–5 e limites 4/9/16).

interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

export interface UpsertRiskMatrixInput {
  probabilityLabels: string[];
  impactLabels: string[];
  lowMax: number;
  mediumMax: number;
  highMax: number;
}

export async function upsertRiskMatrixConfig(
  input: ActorContext & UpsertRiskMatrixInput
) {
  const before = await getEffectiveRiskMatrix(input.organizationId);

  const data = {
    probabilityLabels: input.probabilityLabels,
    impactLabels: input.impactLabels,
    lowMax: input.lowMax,
    mediumMax: input.mediumMax,
    highMax: input.highMax,
    updatedBy: input.actorId,
  };

  const config = await prisma.riskMatrixConfig.upsert({
    where: { organizationId: input.organizationId },
    create: {
      organizationId: input.organizationId,
      ...data,
      createdBy: input.actorId,
    },
    update: { ...data, version: { increment: 1 } },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      objectType: "RiskMatrixConfig",
      objectId: config.id,
      action: before.isCustom ? "UPDATE" : "CREATE",
      oldValue: {
        lowMax: before.lowMax,
        mediumMax: before.mediumMax,
        highMax: before.highMax,
      },
      newValue: {
        lowMax: config.lowMax,
        mediumMax: config.mediumMax,
        highMax: config.highMax,
      },
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });

  return config;
}

export async function getRiskMatrixView(organizationId: string) {
  const matrix = await getEffectiveRiskMatrix(organizationId);
  return {
    probabilityLabels: matrix.probabilityLabels,
    impactLabels: matrix.impactLabels,
    lowMax: matrix.lowMax,
    mediumMax: matrix.mediumMax,
    highMax: matrix.highMax,
    isCustom: matrix.isCustom,
  };
}
