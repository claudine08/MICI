import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { updateRolePermissions } from "@/modules/identity/roles";
import { updateRoleSchema } from "@/modules/identity/schemas";

// Edição de permissões de um papel (E02-US03/US04 + SUPER_USER):
// PATCH → substitui o conjunto de permissões (ROLE:EDIT).
// Papéis do sistema passam a ser editáveis por SUPER_USER/ADMIN (configuração).

export const { PATCH } = apiHandler({
  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "ROLE", "EDIT");

    const { id } = await (context as { params: Promise<{ id: string }> }).params;
    if (!id) throw new AppError("VALIDATION_ERROR", "Id do papel ausente.");

    const body = await request.json().catch(() => null);
    const parsed = updateRoleSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const role = await updateRolePermissions({
      organizationId: tenant.organizationId,
      roleId: id,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      permissionCodes: parsed.data.permissionCodes,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    });

    return Response.json({ role });
  },
});
