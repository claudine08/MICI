import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { transitionDocument } from "@/modules/documents/documents";
import {
  approveDocumentSchema,
  rejectDocumentSchema,
  releaseDocumentSchema,
  obsoleteDocumentSchema,
} from "@/modules/documents/schemas";
import type { DocumentAction } from "@/modules/documents/engine";

async function docIdFrom(context: unknown): Promise<string> {
  const { docId } = await (context as { params: Promise<{ docId: string }> }).params;
  if (!docId) throw new AppError("VALIDATION_ERROR", "Id do documento ausente.");
  return docId;
}

const statusBodySchema = z.object({
  action: z.enum(["SUBMIT", "APPROVE", "REJECT", "RELEASE", "OBSOLETE"]),
  comment: z.string().trim().max(500).optional(),
  reason: z.string().trim().min(1).max(500).optional(),
  effectiveDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD).")
    .optional(),
});

// Transições da máquina §36 (POST /documents/[docId]/status). Permissão por
// ação: SUBMIT=EDIT; APPROVE/RELEASE/OBSOLETE=APPROVE; REJECT=REJECT.
export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    const docId = await docIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = statusBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Ação inválida.", { details: parsed.error.flatten() });
    }
    const { action, comment, reason, effectiveDate } = parsed.data;

    const permissionByAction: Record<DocumentAction, "EDIT" | "APPROVE" | "REJECT"> = {
      SUBMIT: "EDIT",
      APPROVE: "APPROVE",
      REJECT: "REJECT",
      RELEASE: "APPROVE",
      OBSOLETE: "APPROVE",
    };
    assertPermission(tenant, "DOCUMENT", permissionByAction[action]);

    // Campos específicos por ação (motivo obrigatório em REJECT/OBSOLETE).
    if (action === "REJECT") {
      const parsedAction = rejectDocumentSchema.safeParse({ reason });
      if (!parsedAction.success) {
        throw new AppError("VALIDATION_ERROR", "Rejeição exige um motivo.", {
          details: parsedAction.error.flatten(),
        });
      }
    }
    if (action === "OBSOLETE") {
      const parsedAction = obsoleteDocumentSchema.safeParse({ reason });
      if (!parsedAction.success) {
        throw new AppError("VALIDATION_ERROR", "Obsolescência exige um motivo.", {
          details: parsedAction.error.flatten(),
        });
      }
    }
    if (action === "APPROVE") {
      const parsedAction = approveDocumentSchema.safeParse({ comment });
      if (!parsedAction.success) {
        throw new AppError("VALIDATION_ERROR", "Aprovação inválida.", {
          details: parsedAction.error.flatten(),
        });
      }
    }
    if (action === "RELEASE") {
      const parsedAction = releaseDocumentSchema.safeParse({ effectiveDate, comment });
      if (!parsedAction.success) {
        throw new AppError("VALIDATION_ERROR", "Liberação inválida.", {
          details: parsedAction.error.flatten(),
        });
      }
    }

    const document = await transitionDocument({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      documentId: docId,
      action,
      comment,
      reason,
      effectiveDate,
    });
    return Response.json({ document });
  },
});
