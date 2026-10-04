import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listClients } from "@/modules/portfolio/selectors";
import { createClient } from "@/modules/portfolio/clients";
import { createClientSchema } from "@/modules/portfolio/schemas";

// Clientes (E03-US02):
// GET  → lista clientes da organização (PROJECT:VIEW)
// POST → cria cliente (PROJECT:CREATE)

export const { GET, POST } = apiHandler({
  GET: async () => {
    const context = await requireTenantContext();
    assertPermission(context, "PROJECT", "VIEW");
    const clients = await listClients(context.organizationId);
    return Response.json({ clients });
  },

  POST: async (request: NextRequest) => {
    const context = await requireTenantContext();
    assertPermission(context, "PROJECT", "CREATE");

    const body = await request.json().catch(() => null);
    const parsed = createClientSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados do cliente inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const client = await createClient({
      organizationId: context.organizationId,
      actorId: context.userId,
      actorLabel: context.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      ...parsed.data,
    });

    return Response.json({ client }, { status: 201 });
  },
});
