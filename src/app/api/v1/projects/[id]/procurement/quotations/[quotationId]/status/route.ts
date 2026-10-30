import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { transitionQuotationStatus } from "@/modules/procurement/quotations";
import { transitionQuotationSchema } from "@/modules/procurement/schemas";
import { actorOf, idsFrom } from "@/modules/procurement/http";

export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "EDIT");
    const { projectId, resourceId: quotationId } = await idsFrom(context, "quotationId");

    const body = await request.json().catch(() => null);
    const parsed = transitionQuotationSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados da transição inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const updated = await transitionQuotationStatus(
      projectId,
      quotationId,
      parsed.data,
      actorOf(tenant, request)
    );
    return Response.json({ quotation: updated });
  },
});

