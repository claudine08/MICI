import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listCorrectiveActions } from "@/modules/quality/selectors";
import { createCorrectiveAction } from "@/modules/quality/corrective-actions";
import { createCorrectiveActionSchema } from "@/modules/quality/schemas";
import { actorOf, projectIdFrom } from "@/modules/quality/http";

// Ações corretivas (E13-US04): GET lista (QUALITY:VIEW) com filtro ?status=
// e ?nonConformityId=; POST cria (QUALITY:CREATE) a partir de um NCR.
export const { GET, POST } = apiHandler({
  GET: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "VIEW");
    const projectId = await projectIdFrom(context);
    const url = new URL(request.url);
    const correctiveActions = await listCorrectiveActions(tenant.organizationId, projectId, {
      status: url.searchParams.get("status") ?? undefined,
      nonConformityId: url.searchParams.get("nonConformityId") ?? undefined,
    });
    return Response.json({ correctiveActions });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "CREATE");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = createCorrectiveActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Ação corretiva inválida.", {
        details: parsed.error.flatten(),
      });
    }

    const correctiveAction = await createCorrectiveAction({
      ...actorOf(tenant, request),
      projectId,
      ...parsed.data,
    });
    return Response.json({ correctiveAction }, { status: 201 });
  },
});
