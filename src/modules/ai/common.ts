import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";

export {
  assertCodeFree,
  assertMember,
  audit,
  emitDomainEvent,
  findByIdempotentKey,
  toDate,
} from "@/modules/field/common";

export async function assertAiProject(organizationId: string, projectId: string | null) {
  if (!projectId) return;
  const project = await prisma.project.findFirst({ where: { id: projectId, organizationId, deletedAt: null }, select: { id: true } });
  if (!project) throw new AppError("NOT_FOUND", "Projeto não encontrado nesta organização.");
}