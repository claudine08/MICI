import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listMeetings } from "@/modules/meetings/selectors";
import { createMeeting } from "@/modules/meetings/meetings";
import { createMeetingSchema } from "@/modules/meetings/schemas";

export const { GET, POST } = apiHandler({
  GET: async (request: NextRequest) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROJECT", "VIEW");
    const projectId = request.nextUrl.searchParams.get("projectId") ?? undefined;
    const meetings = await listMeetings(tenant.organizationId, projectId ?? undefined);
    return Response.json({ meetings });
  },
  POST: async (request: NextRequest) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROJECT", "CREATE");
    const body = await request.json();
    const parsed = createMeetingSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Dados inválidos.", { details: parsed.error.flatten() });
    const meeting = await createMeeting({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      projectId: parsed.data.projectId ?? null,
      title: parsed.data.title,
      meetingDate: parsed.data.meetingDate,
      location: parsed.data.location,
      attendees: parsed.data.attendees,
      minutes: parsed.data.minutes,
    });
    return Response.json({ meeting }, { status: 201 });
  },
});

