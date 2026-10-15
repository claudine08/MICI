import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { calculateProjectEvm } from "@/modules/cost/evm";
import { evmQuerySchema } from "@/modules/cost/schemas";

async function projectIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do projeto ausente.");
  return id;
}

// EVM do projeto (E08 §29): PV/EV/AC/CPI/SPI/EAC a partir do custo + cronograma.
// Query opcional ?dataDate=AAAA-MM-DD (default: hoje). Guarda COST:VIEW.
export const { GET } = apiHandler({
  GET: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COST", "VIEW");
    const projectId = await projectIdFrom(context);

    const url = new URL(request.url);
    const raw = url.searchParams.get("dataDate");
    const parsed = evmQuerySchema.safeParse({ dataDate: raw ?? undefined });
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Parâmetro dataDate inválido.", {
        details: parsed.error.flatten(),
      });
    }

    const evm = await calculateProjectEvm(
      tenant.organizationId,
      projectId,
      parsed.data.dataDate
    );
    return Response.json({ evm });
  },
});
