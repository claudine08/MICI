import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { createWebhookEndpoint, listWebhookEndpoints } from "@/modules/integrations/webhooks";
import { createWebhookEndpointSchema } from "@/modules/integrations/schemas";

export const { GET, POST } = apiHandler({
  GET: async (_request, ctx) => {
    const { orgId } = await (ctx as { params: Promise<{ orgId: string }> }).params;
    const context = await requireTenantContext();
    if (orgId !== context.organizationId) throw new AppError("FORBIDDEN", "Organização inválida.");
    assertPermission(context, "INTEGRATION", "VIEW");
    const endpoints = await listWebhookEndpoints(context.organizationId);
    return Response.json({ webhooks: endpoints });
  },
  POST: async (request: NextRequest, ctx) => {
    const { orgId } = await (ctx as { params: Promise<{ orgId: string }> }).params;
    const context = await requireTenantContext();
    if (orgId !== context.organizationId) throw new AppError("FORBIDDEN", "Organização inválida.");
    assertPermission(context, "INTEGRATION", "CREATE");
    const body = await request.json().catch(() => null);
    const parsed = createWebhookEndpointSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados inválidos.", { details: parsed.error.flatten() });
    }
    const endpoint = await createWebhookEndpoint({
      organizationId: context.organizationId,
      actorId: context.userId,
      actorLabel: context.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      url: parsed.data.url,
      secret: parsed.data.secret,
      events: parsed.data.events,
      isActive: parsed.data.isActive,
      description: parsed.data.description,
    });
    return Response.json({ webhook: endpoint }, { status: 201 });
  },
});