import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import {
  getWebhookEndpoint,
  updateWebhookEndpoint,
  deleteWebhookEndpoint,
  listWebhookDeliveries,
} from "@/modules/integrations/webhooks";
import { updateWebhookEndpointSchema } from "@/modules/integrations/schemas";

async function idsFrom(context: unknown) {
  const { orgId, webhookId } = await (context as { params: Promise<{ orgId: string; webhookId: string }> }).params;
  if (!orgId || !webhookId) throw new AppError("VALIDATION_ERROR", "Parâmetros ausentes.");
  return { orgId, webhookId };
}

export const { GET, PATCH, DELETE } = apiHandler({
  GET: async (_request, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "INTEGRATION", "VIEW");
    const { orgId, webhookId } = await idsFrom(context);
    if (orgId !== tenant.organizationId) throw new AppError("FORBIDDEN", "Organização inválida.");
    const endpoint = await getWebhookEndpoint(tenant.organizationId, webhookId);
    const deliveries = await listWebhookDeliveries(tenant.organizationId, webhookId, 20);
    return Response.json({ webhook: endpoint, deliveries });
  },
  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "INTEGRATION", "EDIT");
    const { orgId, webhookId } = await idsFrom(context);
    if (orgId !== tenant.organizationId) throw new AppError("FORBIDDEN", "Organização inválida.");
    const body = await request.json().catch(() => null);
    const parsed = updateWebhookEndpointSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados inválidos.", { details: parsed.error.flatten() });
    }
    const webhook = await updateWebhookEndpoint(tenant.organizationId, webhookId, {
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    }, parsed.data);
    return Response.json({ webhook });
  },
  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "INTEGRATION", "DELETE");
    const { orgId, webhookId } = await idsFrom(context);
    if (orgId !== tenant.organizationId) throw new AppError("FORBIDDEN", "Organização inválida.");
    await deleteWebhookEndpoint(tenant.organizationId, webhookId, {
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    });
    return Response.json({ ok: true });
  },
});