import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import type { ActorContext } from "@/modules/field/common";

export type { ActorContext } from "@/modules/field/common";
export {
  assertCodeFree,
  assertFieldLinks,
  assertMember,
  findByIdempotentKey,
  toDate,
} from "@/modules/field/common";

// Auditoria com tratamento de projectId opcional (Fornecedor é escopo da org).
export function audit(
  input: ActorContext,
  projectId: string | null | undefined,
  objectType: string,
  action: string,
  data: { objectId: string; oldValue?: unknown; newValue?: unknown; reason?: string | null }
) {
  return prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      projectId: projectId && projectId.trim().length > 0 ? projectId : null,
      objectType,
      objectId: data.objectId,
      action,
      ...(data.oldValue !== undefined ? { oldValue: data.oldValue as never } : {}),
      ...(data.newValue !== undefined ? { newValue: data.newValue as never } : {}),
      reason: data.reason ?? null,
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });
}

// Domain events com projectId opcional.
export async function emitDomainEvent(
  input: ActorContext,
  projectId: string | null | undefined,
  eventType: string,
  aggregateType: string,
  aggregateId: string,
  payload: Record<string, unknown>
) {
  await prisma.domainEvent.create({
    data: {
      organizationId: input.organizationId,
      projectId: projectId && projectId.trim().length > 0 ? projectId : null,
      actorId: input.actorId,
      eventType,
      aggregateType,
      aggregateId,
      payload: payload as never,
    },
  });
}

// O projeto precisa existir e pertencer à organização (escopo de tenant).
export async function assertProcurementProject(organizationId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!project) {
    throw new AppError("NOT_FOUND", "Projeto não encontrado nesta organização.");
  }
}

// Geração sequencial de códigos (§13 identidade):
// - SP001, SP002... para Fornecedores (escopo da organização)
// - PR001, PR002... para Requisições de Compra (escopo do projeto)
// - QT001, QT002... para Cotações (escopo do projeto)
// - BC001, BC002... para Mapas Comparativos (escopo do projeto)
export async function nextProcurementCode(
  scopeId: string,
  prefix: "SP" | "PR" | "QT" | "BC"
): Promise<string> {
  let rows: { code: string }[];
  if (prefix === "SP") {
    // scopeId é organizationId
    rows = await prisma.supplier.findMany({
      where: { organizationId: scopeId },
      select: { code: true },
    });
  } else if (prefix === "PR") {
    rows = await prisma.purchaseRequest.findMany({
      where: { projectId: scopeId },
      select: { code: true },
    });
  } else if (prefix === "QT") {
    rows = await prisma.quotation.findMany({
      where: { projectId: scopeId },
      select: { code: true },
    });
  } else {
    rows = await prisma.bidComparison.findMany({
      where: { projectId: scopeId },
      select: { code: true },
    });
  }

  let maxNum = 0;
  for (const row of rows) {
    if (row.code.startsWith(prefix)) {
      const rest = row.code.slice(prefix.length);
      const parsed = parseInt(rest, 10);
      if (!Number.isNaN(parsed) && parsed > maxNum) {
        maxNum = parsed;
      }
    }
  }

  const nextNum = maxNum + 1;
  return `${prefix}${nextNum.toString().padStart(3, "0")}`;
}
