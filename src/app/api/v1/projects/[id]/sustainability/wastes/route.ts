
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listWasteRecords } from "@/modules/sustainability/selectors";
import { createWasteRecord } from "@/modules/sustainability/wastes";
import { createWasteRecordSchema } from "@/modules/sustainability/schemas";
import { actorOf, projectIdFrom } from "@/modules/sustainability/http";

export const { GET, POST } = apiHandler({
  GET: async (request, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SUSTAINABILITY", "VIEW");
    const projectId = await projectIdFrom(context);
    const wastes = await listWasteRecords(tenant.organizationId, projectId);
    return Response.json({ wastes });
  },
  POST: async (request, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "SUSTAINABILITY", "CREATE");
    const projectId = await projectIdFrom(context);
    const body = await request.json().catch(() => null);
    const parsed = createWasteRecordSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Resíduo inválido.", { details: parsed.error.flatten() });
    const waste = await createWasteRecord({ ...actorOf(tenant, request), projectId, ...parsed.data });
    return Response.json({ waste }, { status: 201 });
  },
});