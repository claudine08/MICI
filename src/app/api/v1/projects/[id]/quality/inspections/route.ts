import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listInspections } from "@/modules/quality/selectors";
import { createInspection } from "@/modules/quality/inspections";
import { createInspectionSchema } from "@/modules/quality/schemas";
import { actorOf, projectIdFrom } from "@/modules/quality/http";

// Inspeções (E13-US02, §33): GET lista (QUALITY:VIEW) com filtro ?status=,
// POST cria (QUALITY:CREATE) com critério de aceite obrigatório.
export const { GET, POST } = apiHandler({
  GET: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "VIEW");
    const projectId = await projectIdFrom(context);
    const url = new URL(request.url);
    const inspections = await listInspections(tenant.organizationId, projectId, {
      status: url.searchParams.get("status") ?? undefined,
    });
    return Response.json({ inspections });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "CREATE");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = createInspectionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Inspeção inválida.", {
        details: parsed.error.flatten(),
      });
    }

    const inspection = await createInspection({
      ...actorOf(tenant, request),
      projectId,
      ...parsed.data,
    });
    return Response.json({ inspection }, { status: 201 });
  },
});
