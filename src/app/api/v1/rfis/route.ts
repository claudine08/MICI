import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listRfis } from "@/modules/rfi/selectors";
import { createRfi } from "@/modules/rfi/rfi";
import { createRfiSchema } from "@/modules/rfi/schemas";

export const { GET, POST } = apiHandler({
  GET: async (request: NextRequest) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROJECT", "VIEW");
    const projectId = request.nextUrl.searchParams.get("projectId") ?? undefined;
    const rfis = await listRfis(tenant.organizationId, projectId);
    return Response.json({ rfis });
  },
  POST: async (request: NextRequest) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROJECT", "CREATE");
    const body = await request.json();
    const parsed = createRfiSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Dados inválidos.", { details: parsed.error.flatten() });
    const rfi = await createRfi({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      ...parsed.data,
    });
    return Response.json({ rfi }, { status: 201 });
  },
});