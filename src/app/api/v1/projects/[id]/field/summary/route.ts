import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listFieldSummaries } from "@/modules/field/selectors";
import { projectIdFrom } from "@/modules/field/http";

// Resumo de campo (E12-US06, §38 — home de campo): Hoje / Esta semana /
// Atrasadas / Restrições abertas por projeto. ?scope=org devolve o quadro
// da organização inteira (visão global /campo).
export const { GET } = apiHandler({
  GET: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "VIEW");
    const scope = new URL(request.url).searchParams.get("scope");

    if (scope === "org") {
      const summaries = await listFieldSummaries(tenant.organizationId);
      return Response.json({ summaries });
    }

    const projectId = await projectIdFrom(context);
    const summaries = (await listFieldSummaries(tenant.organizationId)).filter(
      (row) => row.projectId === projectId
    );
    return Response.json({ summaries });
  },
});
