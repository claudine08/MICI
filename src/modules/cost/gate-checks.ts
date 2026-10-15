import { prisma } from "@/lib/prisma";

// Regra de gate G4 (§18-G4, E08): aprovar "Contrato e plano" exige que o
// orçamento do projeto tenha uma baseline de custo APROVADA. Projeto sem
// nenhum item de custo não exige baseline (não há o que congelar).

export interface CostApprovalBlock {
  code: "COST_BASELINE_REQUIRED";
  message: string;
}

export async function getG4CostApprovalBlocks(
  organizationId: string,
  projectId: string
): Promise<CostApprovalBlock[]> {
  const itemCount = await prisma.costItem.count({
    where: { organizationId, projectId, deletedAt: null },
  });
  if (itemCount === 0) {
    return [];
  }

  const approved = await prisma.baseline.findFirst({
    where: { organizationId, projectId, type: "COST", status: "APPROVED" },
    select: { id: true },
  });
  if (approved) {
    return [];
  }

  return [
    {
      code: "COST_BASELINE_REQUIRED",
      message:
        "O projeto tem orçamento, mas nenhuma baseline de custo aprovada. " +
        "Registre e aprove a baseline de custo antes de aprovar o gate G4.",
    },
  ];
}
