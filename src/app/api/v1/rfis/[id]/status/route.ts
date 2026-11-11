import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { transitionRfi } from "@/modules/rfi/rfi";
import { transitionRfiSchema } from "@/modules/rfi/schemas";

async function idFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id ausente.");
  return id;
}

export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROJECT", "EDIT");
    const id = await idFrom(context);
    const body = await request.json();
    const parsed = transitionRfiSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Dados inválidos.", { details: parsed.error.flatten() });
    const rfi = await transitionRfi({ organizationId: tenant.organizationId, actorId: tenant.userId, actorLabel: tenant.userEmail, rfiId: id, action: parsed.data.action });
    return Response.json({ rfi });
  },
});