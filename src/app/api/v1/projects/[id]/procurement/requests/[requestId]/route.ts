import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getPurchaseRequestById } from "@/modules/procurement/selectors";
import {
  deletePurchaseRequest,
  updatePurchaseRequest,
} from "@/modules/procurement/requests";
import { updatePurchaseRequestSchema } from "@/modules/procurement/schemas";
import { actorOf, idsFrom } from "@/modules/procurement/http";

export const { GET, PATCH, DELETE } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "VIEW");
    const { projectId, resourceId: requestId } = await idsFrom(context, "requestId");

    const request = await getPurchaseRequestById(projectId, requestId);
    if (!request) throw new AppError("NOT_FOUND", "Requisição de compra não encontrada.");
    return Response.json({ request });
  },

  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "EDIT");
    const { projectId, resourceId: requestId } = await idsFrom(context, "requestId");

    const body = await request.json().catch(() => null);
    const parsed = updatePurchaseRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados da requisição inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const updated = await updatePurchaseRequest(
      projectId,
      requestId,
      parsed.data,
      actorOf(tenant, request)
    );
    return Response.json({ request: updated });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "DELETE");
    const { projectId, resourceId: requestId } = await idsFrom(context, "requestId");

    const result = await deletePurchaseRequest(projectId, requestId, actorOf(tenant, request));
    return Response.json(result);
  },
});

