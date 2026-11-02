import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listAcceptances } from "@/modules/commissioning/selectors";
import { createAcceptance } from "@/modules/commissioning/acceptances";
import { createAcceptanceSchema } from "@/modules/commissioning/schemas";
import { actorOf, projectIdFrom } from "@/modules/commissioning/http";

export const { GET, POST } = apiHandler({
  GET: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COMMISSIONING", "VIEW");
    const projectId = await projectIdFrom(context);
    const acceptances = await listAcceptances(tenant.organizationId, projectId);
    return Response.json({ acceptances });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COMMISSIONING", "CREATE");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = createAcceptanceSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Aceite inválido.", { details: parsed.error.flatten() });
    }

    const acceptance = await createAcceptance({ ...actorOf(tenant, request), projectId, ...parsed.data });
    return Response.json({ acceptance }, { status: 201 });
  },
});