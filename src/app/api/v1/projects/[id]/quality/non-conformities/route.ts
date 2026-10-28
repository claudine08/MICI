import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listNonConformities } from "@/modules/quality/selectors";
import { createNonConformity } from "@/modules/quality/nonconformities";
import { createNonConformitySchema } from "@/modules/quality/schemas";
import { actorOf, projectIdFrom } from "@/modules/quality/http";

// Não conformidades — NCR (E13-US03, §33): GET lista (QUALITY:VIEW) com
// filtro ?status= e ?inspectionId=; POST cria (QUALITY:CREATE). A reprovação
// de inspeção gera um NCR automaticamente no módulo de inspeções.
export const { GET, POST } = apiHandler({
  GET: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "VIEW");
    const projectId = await projectIdFrom(context);
    const url = new URL(request.url);
    const nonConformities = await listNonConformities(tenant.organizationId, projectId, {
      status: url.searchParams.get("status") ?? undefined,
      inspectionId: url.searchParams.get("inspectionId") ?? undefined,
    });
    return Response.json({ nonConformities });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "QUALITY", "CREATE");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = createNonConformitySchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Não conformidade inválida.", {
        details: parsed.error.flatten(),
      });
    }

    const nonConformity = await createNonConformity({
      ...actorOf(tenant, request),
      projectId,
      ...parsed.data,
    });
    return Response.json({ nonConformity }, { status: 201 });
  },
});
