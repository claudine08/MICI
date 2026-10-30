import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getBidComparisonByRequestId } from "@/modules/procurement/selectors";
import { createOrUpdateBidComparison } from "@/modules/procurement/comparisons";
import { createOrUpdateBidComparisonSchema } from "@/modules/procurement/schemas";
import { actorOf, idsFrom } from "@/modules/procurement/http";

export const { GET, POST } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "VIEW");
    const { projectId, resourceId: requestId } = await idsFrom(context, "requestId");

    const comparison = await getBidComparisonByRequestId(projectId, requestId);
    return Response.json({ comparison });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "EDIT");
    const { projectId, resourceId: requestId } = await idsFrom(context, "requestId");

    const body = await request.json().catch(() => null);
    const parsed = createOrUpdateBidComparisonSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados do mapa comparativo inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const comparison = await createOrUpdateBidComparison(
      projectId,
      requestId,
      parsed.data,
      actorOf(tenant, request)
    );
    return Response.json({ comparison });
  },
});

