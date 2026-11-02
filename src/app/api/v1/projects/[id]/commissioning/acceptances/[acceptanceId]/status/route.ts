import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { transitionAcceptance } from "@/modules/commissioning/acceptances";
import { acceptanceTransitionSchema } from "@/modules/commissioning/schemas";
import { actorOf, idsFrom } from "@/modules/commissioning/http";

export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COMMISSIONING", "EDIT");
    const { resourceId: acceptanceId } = await idsFrom(context, "acceptanceId");

    const body = await request.json().catch(() => null);
    const parsed = acceptanceTransitionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Transição inválida.", { details: parsed.error.flatten() });
    }

    const acceptance = await transitionAcceptance({ ...actorOf(tenant, request), acceptanceId, ...parsed.data });
    return Response.json({ acceptance });
  },
});