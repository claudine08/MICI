import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import type { ActorContext } from "@/modules/field/common";
import { sendEmail } from "@/modules/integrations/email";
import { transitionCostBaseline } from "@/modules/cost/baselines";

export interface CreateApprovalInput extends ActorContext {
  projectId?: string | null;
  objectType: string;
  objectId: string;
  approverEmail: string;
  expiresInDays?: number;
  baseUrl: string;
}

export async function createApprovalRequest(input: CreateApprovalInput) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + (input.expiresInDays ?? 7) * 24 * 60 * 60 * 1000);
  const req = await prisma.approvalRequest.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      objectType: input.objectType,
      objectId: input.objectId,
      approverEmail: input.approverEmail,
      token,
      expiresAt,
      createdBy: input.actorId,
    },
  });

  const link = `${input.baseUrl}/aprovacoes/${token}`;
  await sendEmail({
    to: input.approverEmail,
    subject: `Aprovação solicitada — ${input.objectType}`,
    html: `<p>Você foi solicitado a aprovar um registro (${input.objectType}).</p>
<p><a href="${link}">Abrir aprovação</a></p>
<p>Este link expira em ${input.expiresInDays ?? 7} dias.</p>`,
    text: `Aprovação solicitada: ${link}`,
  });

  return req;
}

export async function getApprovalRequest(token: string) {
  const req = await prisma.approvalRequest.findUnique({ where: { token } });
  if (!req) throw new AppError("NOT_FOUND", "Solicitação de aprovação não encontrada.");
  if (req.status === "PENDING" && req.expiresAt.getTime() < Date.now()) {
    await prisma.approvalRequest.update({ where: { id: req.id }, data: { status: "EXPIRED" } });
    req.status = "EXPIRED";
  }
  return req;
}

export async function decideApprovalRequest(input: {
  token: string;
  decision: "APPROVED" | "REJECTED";
  comment?: string | null;
  decidedByName?: string | null;
  decidedByEmail?: string | null;
}) {
  const req = await getApprovalRequest(input.token);
  if (req.status !== "PENDING") {
    throw new AppError("VALIDATION_ERROR", `Solicitação já está ${req.status}.`);
  }
  const updated = await prisma.approvalRequest.update({
    where: { id: req.id },
    data: {
      status: input.decision,
      decisionComment: input.comment ?? null,
      decidedByName: input.decidedByName ?? null,
      decidedByEmail: input.decidedByEmail ?? null,
      decidedAt: new Date(),
    },
  });

  // Propaga a decisão para o baseline de custo (se aplicável).
  if (req.objectType === "COST_BASELINE") {
    const actorId = req.createdBy ?? "system";
    const actorLabel = input.decidedByName ?? input.decidedByEmail ?? "Aprovador externo";
    const ctx = { organizationId: req.organizationId, actorId, actorLabel };
    try {
      if (input.decision === "APPROVED") {
        try {
          await transitionCostBaseline({ ...ctx, baselineId: req.objectId, action: "SUBMIT" });
        } catch {
          // ignora se já submetido
        }
        await transitionCostBaseline({ ...ctx, baselineId: req.objectId, action: "APPROVE" });
      } else if (input.decision === "REJECTED") {
        await transitionCostBaseline({ ...ctx, baselineId: req.objectId, action: "REJECT" });
      }
    } catch {
      // não bloqueia o registro da decisão
    }
  }

  return updated;
}