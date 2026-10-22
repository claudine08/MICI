import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listProgress } from "@/modules/field/selectors";
import { createProgress } from "@/modules/field/progress";
import { createProgressSchema } from "@/modules/field/schemas";
import { actorOf, projectIdFrom } from "@/modules/field/http";

// Medição de avanço físico (E12-US04, BR-006): GET lista (FIELD:VIEW;
// ?activityId=/wbsNodeId= filtram), POST cria (FIELD:CREATE) — método,
// percentual, quantidade física real e critério obrigatórios.
export const { GET, POST } = apiHandler({
  GET: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "VIEW");
    const projectId = await projectIdFrom(context);
    const url = new URL(request.url);
    const progress = await listProgress(tenant.organizationId, projectId, {
      activityId: url.searchParams.get("activityId") ?? undefined,
      wbsNodeId: url.searchParams.get("wbsNodeId") ?? undefined,
    });
    return Response.json({ progress });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "CREATE");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = createProgressSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Medição inválida.", {
        details: parsed.error.flatten(),
      });
    }

    const measurement = await createProgress({
      ...actorOf(tenant, request),
      projectId,
      ...parsed.data,
    });
    return Response.json({ measurement }, { status: 201 });
  },
});
