
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { updateWasteRecord, deleteWasteRecord } from "@/modules/sustainability/wastes";
import { updateWasteRecordSchema } from "@/modules/sustainability/schemas";
import { actorOf, idsFrom } from "@/modules/sustainability/http";

export const { PATCH, DELETE } = apiHandler({
  PATCH: async (request, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SUSTAINABILITY", "EDIT");
    const { resourceId: wasteId } = await idsFrom(context, "wasteId");
    const body = await request.json().catch(() => null);
    const parsed = updateWasteRecordSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Resíduo inválido.", { details: parsed.error.flatten() });
    const waste = await updateWasteRecord({ ...actorOf(tenant, request), wasteId, ...parsed.data });
    return Response.json({ waste });
  },
  DELETE: async (request, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SUSTAINABILITY", "DELETE");
    const { resourceId: wasteId } = await idsFrom(context, "wasteId");
    const result = await deleteWasteRecord({ ...actorOf(tenant, request), wasteId });
    return Response.json(result);
  },
});