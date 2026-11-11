import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { recordResponse } from "@/modules/supplier-rfi/supplier-rfi";
import { recordResponseSchema } from "@/modules/supplier-rfi/schemas";

async function idFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id ausente.");
  return id;
}

export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "EDIT");
    const id = await idFrom(context);
    const body = await request.json();
    const parsed = recordResponseSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Dados inválidos.", { details: parsed.error.flatten() });
    const recipient = await recordResponse({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      rfiId: id,
      supplierId: parsed.data.supplierId,
      quotedAmount: parsed.data.quotedAmount,
      leadTimeDays: parsed.data.leadTimeDays,
      notes: parsed.data.notes,
    });
    return Response.json({ recipient });
  },
});