import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { answerRfi } from "@/modules/rfi/rfi";
import { answerRfiSchema } from "@/modules/rfi/schemas";

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
    const parsed = answerRfiSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Dados inválidos.", { details: parsed.error.flatten() });
    const rfi = await answerRfi({ organizationId: tenant.organizationId, actorId: tenant.userId, actorLabel: tenant.userEmail, rfiId: id, response: parsed.data.response });
    return Response.json({ rfi });
  },
});