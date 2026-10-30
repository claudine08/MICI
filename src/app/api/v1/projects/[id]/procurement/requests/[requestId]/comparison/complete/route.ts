import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { completeBidComparison } from "@/modules/procurement/comparisons";
import { completeBidComparisonSchema } from "@/modules/procurement/schemas";
import { actorOf, idsFrom } from "@/modules/procurement/http";

export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "EDIT");
    const { projectId, resourceId: requestId } = await idsFrom(context, "requestId");

    const body = await request.json().catch(() => null);
    const parsed = completeBidComparisonSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados para conclusão do mapa comparativo inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const comparison = await completeBidComparison(
      projectId,
      requestId,
      parsed.data,
      actorOf(tenant, request)
    );
    return Response.json({ comparison });
  },
});

