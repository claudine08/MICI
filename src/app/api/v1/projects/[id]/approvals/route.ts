import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { createApprovalRequest } from "@/modules/integrations/approvals";
import { z } from "zod";

const createSchema = z.object({
  objectType: z.string().min(1).max(64),
  objectId: z.string().uuid(),
  approverEmail: z.string().email(),
  expiresInDays: z.number().int().min(1).max(30).optional(),
});

export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "INTEGRATION", "CREATE");
    const { id: projectId } = await (context as { params: Promise<{ id: string }> }).params;
    const body = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados inválidos.", { details: parsed.error.flatten() });
    }
    const baseUrl = process.env.AUTH_URL ?? "http://localhost:3000";
    const approval = await createApprovalRequest({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      projectId,
      objectType: parsed.data.objectType,
      objectId: parsed.data.objectId,
      approverEmail: parsed.data.approverEmail,
      expiresInDays: parsed.data.expiresInDays,
      baseUrl,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    });
    return Response.json({ approval }, { status: 201 });
  },
});