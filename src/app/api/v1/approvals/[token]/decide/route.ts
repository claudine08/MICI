import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { decideApprovalRequest } from "@/modules/integrations/approvals";
import { z } from "zod";

const schema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  comment: z.string().max(1000).optional().nullable(),
});

export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const { token } = await (context as { params: Promise<{ token: string }> }).params;
    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados inválidos.", { details: parsed.error.flatten() });
    }
    const approval = await decideApprovalRequest({
      token,
      decision: parsed.data.decision,
      comment: parsed.data.comment,
    });
    return Response.json({ approval });
  },
});