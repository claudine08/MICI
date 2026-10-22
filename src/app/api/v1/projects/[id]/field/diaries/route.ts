import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listDiaries } from "@/modules/field/selectors";
import { createDiary } from "@/modules/field/diaries";
import { createDiarySchema } from "@/modules/field/schemas";
import { actorOf, projectIdFrom } from "@/modules/field/http";

// Diários de obra do projeto (E12-US01, §26):
// GET → lista os diários vivos (FIELD:VIEW). POST → cria (FIELD:CREATE) —
// um diário por data de obra (índice único do módulo).
export const { GET, POST } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "VIEW");
    const projectId = await projectIdFrom(context);
    const diaries = await listDiaries(tenant.organizationId, projectId);
    return Response.json({ diaries });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "CREATE");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = createDiarySchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Diário inválido.", {
        details: parsed.error.flatten(),
      });
    }

    const diary = await createDiary({
      ...actorOf(tenant, request),
      projectId,
      ...parsed.data,
    });
    return Response.json({ diary }, { status: 201 });
  },
});
