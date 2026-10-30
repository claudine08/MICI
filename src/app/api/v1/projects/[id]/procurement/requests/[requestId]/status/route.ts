import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { transitionPurchaseRequestStatus } from "@/modules/procurement/requests";
import { transitionPurchaseRequestSchema } from "@/modules/procurement/schemas";
import { actorOf, idsFrom } from "@/modules/procurement/http";

export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    const { projectId, resourceId: requestId } = await idsFrom(context, "requestId");

    const body = await request.json().catch(() => null);
    const parsed = transitionPurchaseRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados da transição inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    if (parsed.data.action === "APPROVE") {
      assertPermission(tenant, "PROCUREMENT", "APPROVE");
    } else if (parsed.data.action === "REJECT") {
      assertPermission(tenant, "PROCUREMENT", "REJECT");
    } else {
      assertPermission(tenant, "PROCUREMENT", "EDIT");
    }

    const updated = await transitionPurchaseRequestStatus(
      projectId,
      requestId,
      parsed.data,
      actorOf(tenant, request)
    );
    return Response.json({ request: updated });
  },
});

