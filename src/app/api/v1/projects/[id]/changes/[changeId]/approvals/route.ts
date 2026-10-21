import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listChangeApprovals } from "@/modules/change/selectors";

// Histórico de aprovações da mudança (E11, §31 — append-only): decisões
// APPROVE/REJECT gravadas pelas transições de status (RISK:VIEW equivale a
// CHANGE:VIEW aqui).
export const { GET } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "CHANGE", "VIEW");
    const { changeId } = await (context as {
      params: Promise<{ id: string; changeId: string }>;
    }).params;
    if (!changeId) throw new AppError("VALIDATION_ERROR", "Id da mudança ausente.");

    const approvals = await listChangeApprovals(tenant.organizationId, changeId);
    return Response.json({ approvals });
  },
});
