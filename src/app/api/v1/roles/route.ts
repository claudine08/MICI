import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listRoles } from "@/modules/identity/selectors";
import { createCustomRole } from "@/modules/identity/roles";
import { createRoleSchema } from "@/modules/identity/schemas";

// Papéis (E02-US03/US04):
// GET  → papéis da organização com permissões (ROLE:VIEW)
// POST → cria papel customizado (ROLE:CREATE)

export const { GET, POST } = apiHandler({
  GET: async () => {
    const context = await requireTenantContext();
    assertPermission(context, "ROLE", "VIEW");
    const roles = await listRoles(context.organizationId);
    return Response.json({ roles });
  },

  POST: async (request: NextRequest) => {
    const context = await requireTenantContext();
    assertPermission(context, "ROLE", "CREATE");

    const body = await request.json().catch(() => null);
    const parsed = createRoleSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados do papel inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const role = await createCustomRole({
      organizationId: context.organizationId,
      actorId: context.userId,
      actorLabel: context.userEmail,
      code: parsed.data.code,
      name: parsed.data.name,
      description: parsed.data.description,
      permissionCodes: parsed.data.permissionCodes,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    });

    return Response.json({ role }, { status: 201 });
  },
});
