import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";

// Helpers de escrita do módulo de qualidade (E13). Os utilitários genéricos
// (auditoria, domain events, datas, código livre, idempotência, membro ativo
// e vínculos WBS/atividade) são os mesmos do módulo de campo — reutilizados
// para não duplicar regra; aqui ficam só os específicos da qualidade.

export type { ActorContext } from "@/modules/field/common";
export {
  assertCodeFree,
  assertFieldLinks,
  assertMember,
  audit,
  emitDomainEvent,
  findByIdempotentKey,
  toDate,
} from "@/modules/field/common";

// O projeto precisa existir e pertencer à organização (escopo de tenant).
export async function assertQualityProject(organizationId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!project) {
    throw new AppError("NOT_FOUND", "Projeto não encontrado nesta organização.");
  }
}

// Código automático por projeto e prefixo (CT/CE/IN — §13 identidade).
export async function nextQualityCode(
  projectId: string,
  prefix: "CT" | "CE" | "IN"
): Promise<string> {
  let rows: { code: string }[];
  switch (prefix) {
    case "CT":
      rows = await prisma.checklistTemplate.findMany({
        where: { projectId },
        select: { code: true },
      });
      break;
    case "CE":
      rows = await prisma.checklistExecution.findMany({
        where: { projectId },
        select: { code: true },
      });
      break;
    default:
      rows = await prisma.inspection.findMany({
        where: { projectId },
        select: { code: true },
      });
  }

  let max = 0;
  for (const { code } of rows) {
    const match = new RegExp(`^${prefix}(\\d+)$`).exec(code);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}
