import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { logger } from "@/lib/logger";
import type { ActorContext } from "@/modules/field/common";
import { enqueueJob, runJobNow } from "@/modules/integrations/jobs";
import { isProviderEnabled } from "@/modules/integrations/isolation";
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
  if (input.objectType === "COST_BASELINE") {
    const baseline = await prisma.baseline.findUnique({ where: { id: input.objectId } });
    if (!baseline) throw new AppError("NOT_FOUND", "Baseline de custo não encontrado.");
    if (baseline.status === "APPROVED" || baseline.status === "SUPERSEDED") {
      throw new AppError("VALIDATION_ERROR", "Baseline já aprovado/substituído não pode ser reenviado para aprovação.");
    }
  }
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
  await queueApprovalEmail(req.id, link, input);

  return req;
}

// Envio desacoplado (isolamento de falhas): o e-mail vira um job idempotente
// na fila e é entregue best-effort agora (caminho inline). Se o provedor
// estiver lento/fora, o job permanece PENDING e o cron retoma com retry —
// a criação da aprovação nunca depende do provedor de e-mail.
async function queueApprovalEmail(approvalId: string, link: string, input: CreateApprovalInput) {
  if (!isProviderEnabled("email")) {
    logger.warn("approval_email_disabled", { approvalId, correlationId: input.correlationId });
    return;
  }
  const jobId = await enqueueJob({
    type: "email.send",
    dedupeKey: `email.approval:${approvalId}`,
    payload: {
      to: input.approverEmail,
      subject: `Aprovação solicitada — ${input.objectType}`,
      html: `<p>Você foi solicitado a aprovar um registro (${input.objectType}).</p>
<p><a href="${link}">Abrir aprovação</a></p>
<p>Este link expira em ${input.expiresInDays ?? 7} dias.</p>`,
      text: `Aprovação solicitada: ${link}`,
    },
  });
  if (jobId) await runJobNow(jobId); // best-effort: falha fica para o cron
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