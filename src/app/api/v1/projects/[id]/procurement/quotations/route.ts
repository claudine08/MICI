import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listQuotations } from "@/modules/procurement/selectors";
import { createQuotation } from "@/modules/procurement/quotations";
import { createQuotationSchema } from "@/modules/procurement/schemas";
import { actorOf, projectIdFrom } from "@/modules/procurement/http";

export const { GET, POST } = apiHandler({
  GET: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "VIEW");
    const projectId = await projectIdFrom(context);
    const url = new URL(request.url);

    const quotations = await listQuotations(projectId, {
      requestId: url.searchParams.get("requestId") ?? undefined,
      supplierId: url.searchParams.get("supplierId") ?? undefined,
    });
    return Response.json({ quotations });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROCUREMENT", "CREATE");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = createQuotationSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados da cotação inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const quotation = await createQuotation(projectId, parsed.data, actorOf(tenant, request));
    return Response.json({ quotation }, { status: 201 });
  },
});

