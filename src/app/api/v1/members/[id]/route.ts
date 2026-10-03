import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { updateMember, removeMember } from "@/modules/identity/members";
import { updateMemberSchema } from "@/modules/identity/schemas";

async function membershipIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id da membresia ausente.");
  return id;
}

// Membresia específica (E02):
// PATCH  → papéis/status (USER:EDIT)
// DELETE → remoção soft-delete (USER:EDIT)

export const { PATCH, DELETE } = apiHandler({
  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "USER", "EDIT");
    const membershipId = await membershipIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = updateMemberSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const result = await updateMember({
      organizationId: tenant.organizationId,
      membershipId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      roleCodes: parsed.data.roleCodes,
      status: parsed.data.status,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    });

    return Response.json({ member: result });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "USER", "EDIT");
    const membershipId = await membershipIdFrom(context);

    const result = await removeMember({
      organizationId: tenant.organizationId,
      membershipId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    });

    return Response.json({ member: result });
  },
});
