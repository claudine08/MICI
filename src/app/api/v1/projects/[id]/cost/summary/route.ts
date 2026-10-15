import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import {
  listCostItems,
  listCommitments,
  listActuals,
} from "@/modules/cost/selectors";
import { listCostBaselines } from "@/modules/cost/baselines";
import { calculateProjectEvm } from "@/modules/cost/evm";
import { evmQuerySchema } from "@/modules/cost/schemas";

async function projectIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do projeto ausente.");
  return id;
}

// Payload consolidado da tela de custos (E08 §29): itens, compromissos,
// realizados, baselines e o EVM corrente. `?dataDate=` opcional (default hoje).
export const { GET } = apiHandler({
  GET: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COST", "VIEW");
    const projectId = await projectIdFrom(context);

    const url = new URL(request.url);
    const raw = url.searchParams.get("dataDate") ?? undefined;
    const parsed = evmQuerySchema.safeParse({ dataDate: raw });
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Parâmetro dataDate inválido.", {
        details: parsed.error.flatten(),
      });
    }

    const [items, commitments, actuals, baselines, evm] = await Promise.all([
      listCostItems(tenant.organizationId, projectId),
      listCommitments(tenant.organizationId, projectId),
      listActuals(tenant.organizationId, projectId),
      listCostBaselines(tenant.organizationId, projectId),
      calculateProjectEvm(tenant.organizationId, projectId, parsed.data.dataDate),
    ]);

    return Response.json({ items, commitments, actuals, baselines, evm });
  },
});
