import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { assertCostProject } from "@/modules/cost/selectors";
import type { importEstimateSchema } from "@/modules/cost/schemas";
import type { z } from "zod";

// Importação do estimate de cozinha (E08): o JSON exportado por /orcamento vira
// os itens de custo do projeto (replace-all, mesmo princípio do import de
// cronograma). O total direto importado é gravado no orçamento do projeto.

interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

type ImportEstimateInput = z.infer<typeof importEstimateSchema>;

export interface ImportEstimateResult {
  importedItems: number;
  totalDirect: number;
  replacedItems: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function importEstimateAsCostItems(
  input: ActorContext & { projectId: string; estimate: ImportEstimateInput }
): Promise<ImportEstimateResult> {
  await assertCostProject(input.organizationId, input.projectId);

  const lines = input.estimate.quantitativos;
  if (lines.length === 0) {
    throw new AppError("VALIDATION_ERROR", "Estimate sem quantitativos para importar.");
  }

  const totalDirect = round2(lines.reduce((acc, line) => acc + line.custoTotal, 0));

  // Substituição total: apaga os itens vivos e recria a partir do estimate.
  const existing = await prisma.costItem.findMany({
    where: { organizationId: input.organizationId, projectId: input.projectId, deletedAt: null },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    if (existing.length > 0) {
      await tx.costItem.updateMany({
        where: { id: { in: existing.map((row) => row.id) } },
        data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId },
      });
    }

    for (const [index, line] of lines.entries()) {
      const code = `ORC${String(index + 1).padStart(3, "0")}`;
      await tx.costItem.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          code,
          description: line.descricao.slice(0, 300),
          category: `${line.grupo}-${line.grupoNome}`.slice(0, 64),
          unit: line.unidade.slice(0, 16),
          quantity: line.quantidade,
          unitPrice: line.pu,
          amount: round2(line.custoTotal),
          origin: line.origem ?? "ESTIMATE",
          fontePreco: line.fontePreco ?? null,
          createdBy: input.actorId,
          updatedBy: input.actorId,
        },
      });
    }

    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        projectId: input.projectId,
        objectType: "CostItem",
        objectId: input.projectId,
        action: "IMPORT_ESTIMATE",
        newValue: { importedItems: lines.length, totalDirect, replaced: existing.length },
        correlationId: input.correlationId ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
    await tx.domainEvent.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        actorId: input.actorId,
        eventType: "Cost.EstimateImported",
        aggregateType: "Project",
        aggregateId: input.projectId,
        payload: { importedItems: lines.length, totalDirect },
      },
    });
  });

  return { importedItems: lines.length, totalDirect, replacedItems: existing.length };
}
