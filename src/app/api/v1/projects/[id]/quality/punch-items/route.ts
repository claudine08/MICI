import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listPunchItems } from "@/modules/quality/selectors";
import { createPunchItem } from "@/modules/quality/punch-items";
import { createPunchItemSchema } from "@/modules/quality/schemas";
import { actorOf, projectIdFrom } from "@/modules/quality/http";

// Punch list (E13-US05, §34): GET lista (QUALITY:VIEW) com filtro ?status=;
// POST cria (QUALITY:CREATE) um item de correção com localização e prazo.
export const { GET, POST } = apiHandler({
  GET: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "VIEW");
    const projectId = await projectIdFrom(context);
    const url = new URL(request.url);
    const punchItems = await listPunchItems(tenant.organizationId, projectId, {
      status: url.searchParams.get("status") ?? undefined,
    });
    return Response.json({ punchItems });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "CREATE");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = createPunchItemSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Item de punch list inválido.", {
        details: parsed.error.flatten(),
      });
    }

    const punchItem = await createPunchItem({
      ...actorOf(tenant, request),
      projectId,
      ...parsed.data,
    });
    return Response.json({ punchItem }, { status: 201 });
  },
});
