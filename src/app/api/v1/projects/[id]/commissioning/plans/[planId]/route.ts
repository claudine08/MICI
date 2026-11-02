import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getCommissioningPlanRow } from "@/modules/commissioning/selectors";
import { updateCommissioningPlan, deleteCommissioningPlan } from "@/modules/commissioning/plans";
import { updateCommissioningPlanSchema } from "@/modules/commissioning/schemas";
import { actorOf, idsFrom } from "@/modules/commissioning/http";

export const { GET, PATCH, DELETE } = apiHandler({
  GET: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COMMISSIONING", "VIEW");
    const { projectId, resourceId: planId } = await idsFrom(context, "planId");
    const plan = await getCommissioningPlanRow(tenant.organizationId, planId);
    if (plan.projectId !== projectId) throw new AppError("NOT_FOUND", "Plano não encontrado neste projeto.");
    return Response.json({ plan });
  },

  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COMMISSIONING", "EDIT");
    const { resourceId: planId } = await idsFrom(context, "planId");
    const body = await request.json().catch(() => null);
    const parsed = updateCommissioningPlanSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Plano inválido.", { details: parsed.error.flatten() });
    }
    const plan = await updateCommissioningPlan({ ...actorOf(tenant, request), planId, ...parsed.data });
    return Response.json({ plan });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COMMISSIONING", "DELETE");
    const { resourceId: planId } = await idsFrom(context, "planId");
    const result = await deleteCommissioningPlan({ ...actorOf(tenant, request), planId });
    return Response.json(result);
  },
});