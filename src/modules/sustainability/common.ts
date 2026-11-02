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

export async function assertSustainabilityProject(organizationId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!project) throw new AppError("NOT_FOUND", "Projeto não encontrado nesta organização.");
}

export async function nextSustainabilityCode(
  projectId: string,
  prefix: "SP" | "SM" | "SB" | "ST" | "MS" | "WR"
): Promise<string> {
  let rows: { code: string }[];
  switch (prefix) {
    case "SP":
      rows = await prisma.sustainabilityPlan.findMany({ where: { projectId }, select: { code: true } });
      break;
    case "SM":
      rows = await prisma.sustainabilityMetric.findMany({ where: { projectId }, select: { code: true } });
      break;
    case "SB":
      rows = await prisma.sustainabilityBaseline.findMany({ where: { projectId }, select: { code: true } });
      break;
    case "ST":
      rows = await prisma.sustainabilityTarget.findMany({ where: { projectId }, select: { code: true } });
      break;
    case "MS":
      rows = await prisma.sustainabilityMeasurement.findMany({ where: { projectId }, select: { code: true } });
      break;
    case "WR":
      rows = await prisma.wasteRecord.findMany({ where: { projectId }, select: { code: true } });
      break;
  }
  let max = 0;
  for (const { code } of rows) {
    const match = new RegExp(`^${prefix}(\\d+)$`).exec(code);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}