import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listPurchaseRequests } from "@/modules/procurement/selectors";
import { createPurchaseRequest } from "@/modules/procurement/requests";
import { createPurchaseRequestSchema } from "@/modules/procurement/schemas";
import { actorOf, projectIdFrom } from "@/modules/procurement/http";

export const { GET, POST } = apiHandler({
  GET: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "VIEW");
    const projectId = await projectIdFrom(context);
    const url = new URL(request.url);

    const requests = await listPurchaseRequests(tenant.organizationId, projectId, {
      status: url.searchParams.get("status") ?? undefined,
      costCenter: url.searchParams.get("costCenter") ?? undefined,
      wbsNodeId: url.searchParams.get("wbsNodeId") ?? undefined,
    });
    return Response.json({ requests });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "CREATE");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = createPurchaseRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados da requisição de compra inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const purchaseRequest = await createPurchaseRequest(
      projectId,
      parsed.data,
      actorOf(tenant, request)
    );
    return Response.json({ request: purchaseRequest }, { status: 201 });
  },
});

