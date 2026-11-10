import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getMeeting } from "@/modules/meetings/selectors";
import { updateMeeting, deleteMeeting } from "@/modules/meetings/meetings";
import { updateMeetingSchema } from "@/modules/meetings/schemas";

async function idFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id ausente.");
  return id;
}

export const { GET, PATCH, DELETE } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROJECT", "VIEW");
    const id = await idFrom(context);
    const meeting = await getMeeting(tenant.organizationId, id);
    return Response.json({ meeting });
  },
  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROJECT", "EDIT");
    const id = await idFrom(context);
    const body = await request.json();
    const parsed = updateMeetingSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Dados inválidos.", { details: parsed.error.flatten() });
    const meeting = await updateMeeting({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      meetingId: id,
      ...parsed.data,
    });
    return Response.json({ meeting });
  },
  DELETE: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROJECT", "DELETE");
    const id = await idFrom(context);
    const result = await deleteMeeting({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      meetingId: id,
    });
    return Response.json(result);
  },
});