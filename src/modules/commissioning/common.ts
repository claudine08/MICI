import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";

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

export async function assertCommissioningProject(organizationId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!project) {
    throw new AppError("NOT_FOUND", "Projeto não encontrado nesta organização.");
  }
}

export async function nextCommissioningCode(
  projectId: string,
  prefix: "CP" | "CI" | "AC"
): Promise<string> {
  let rows: { code: string }[];
  switch (prefix) {
    case "CP":
      rows = await prisma.commissioningPlan.findMany({ where: { projectId }, select: { code: true } });
      break;
    case "CI":
      rows = await prisma.commissioningItem.findMany({ where: { projectId }, select: { code: true } });
      break;
    case "AC":
      rows = await prisma.acceptance.findMany({ where: { projectId }, select: { code: true } });
      break;
  }
  let max = 0;
  for (const { code } of rows) {
    const match = new RegExp(`^${prefix}(\\d+)$`).exec(code);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}