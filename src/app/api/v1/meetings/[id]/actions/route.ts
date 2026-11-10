import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { addMeetingAction } from "@/modules/meetings/meetings";
import { createMeetingActionSchema } from "@/modules/meetings/schemas";

async function idFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id ausente.");
  return id;
}

export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROJECT", "EDIT");
    const id = await idFrom(context);
    const body = await request.json();
    const parsed = createMeetingActionSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Dados inválidos.", { details: parsed.error.flatten() });
    const action = await addMeetingAction({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      meetingId: id,
      description: parsed.data.description,
      ownerId: parsed.data.ownerId,
      dueDate: parsed.data.dueDate,
      wbsNodeId: parsed.data.wbsNodeId,
      activityId: parsed.data.activityId,
      requirementId: parsed.data.requirementId,
    });
    return Response.json({ action }, { status: 201 });
  },
});