import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { dispatchWebhookTest } from "@/modules/integrations/webhooks";

export const { POST } = apiHandler({
  POST: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "INTEGRATION", "ADMIN");
    const { orgId, webhookId } = await (context as { params: Promise<{ orgId: string; webhookId: string }> }).params;
    if (orgId !== tenant.organizationId) throw new AppError("FORBIDDEN", "Organização inválida.");
    const delivery = await dispatchWebhookTest(tenant.organizationId, webhookId);
    return Response.json({ delivery });
  },
});