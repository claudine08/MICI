import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { assertPermission, requireTenantContext } from "@/core/tenant";
import { estimateKitchenBudget } from "@/modules/budget/engine";
import { estimateRequestSchema } from "@/modules/budget/schemas";

// POST /api/v1/budget/estimate — calcula o orçamento preliminar de implantação
// de cozinha industrial (memoria_calculo.txt). Sem persistência: a saída é
// exportada em JSON/CSV como entrada da fase de orçamentação (E08).
export const { POST } = apiHandler({
  POST: async (request: NextRequest) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COST", "CREATE");

    const body = await request.json().catch(() => null);
    const parsed = estimateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados do orçamento inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const estimate = estimateKitchenBudget(parsed.data);
    return Response.json({ estimate });
  },
});
