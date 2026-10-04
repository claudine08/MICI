import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { updateClient, deleteClient } from "@/modules/portfolio/clients";
import { updateClientSchema } from "@/modules/portfolio/schemas";

async function clientIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do cliente ausente.");
  return id;
}

// Cliente específico (E03-US02):
// PATCH  → edição (PROJECT:EDIT)
// DELETE → soft-delete (PROJECT:DELETE)

export const { PATCH, DELETE } = apiHandler({
  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROJECT", "EDIT");
    const clientId = await clientIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = updateClientSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const client = await updateClient({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      clientId,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      ...parsed.data,
    });

    return Response.json({ client });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROJECT", "DELETE");
    const clientId = await clientIdFrom(context);

    const result = await deleteClient({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      clientId,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    });

    return Response.json({ client: result });
  },
});
