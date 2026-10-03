import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listMembers } from "@/modules/identity/selectors";
import { inviteMember } from "@/modules/identity/members";
import { inviteMemberSchema } from "@/modules/identity/schemas";

// Membros da organização (E02):
// GET  → lista membros + papéis (USER:VIEW)
// POST → convida/cria membro com papéis (USER:CREATE)

export const { GET, POST } = apiHandler({
  GET: async () => {
    const context = await requireTenantContext();
    assertPermission(context, "USER", "VIEW");
    const members = await listMembers(context.organizationId);
    return Response.json({ members });
  },

  POST: async (request: NextRequest) => {
    const context = await requireTenantContext();
    assertPermission(context, "USER", "CREATE");

    const body = await request.json().catch(() => null);
    const parsed = inviteMemberSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados do convite inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const result = await inviteMember({
      organizationId: context.organizationId,
      actorId: context.userId,
      actorLabel: context.userEmail,
      email: parsed.data.email,
      name: parsed.data.name,
      temporaryPassword: parsed.data.temporaryPassword,
      roleCodes: parsed.data.roleCodes,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    });

    return Response.json({ member: result }, { status: 201 });
  },
});
