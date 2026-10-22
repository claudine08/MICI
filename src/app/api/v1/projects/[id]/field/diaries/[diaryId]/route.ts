import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getDiaryRow } from "@/modules/field/selectors";
import { updateDiary, deleteDiary } from "@/modules/field/diaries";
import { updateDiarySchema } from "@/modules/field/schemas";
import { actorOf, idsFrom } from "@/modules/field/http";

// Diário individual (E12-US01): GET detalhe (FIELD:VIEW), PATCH edita
// (FIELD:DELETE bloqueia em estado não editável), DELETE exclui logicamente.
export const { GET, PATCH, DELETE } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "VIEW");
    const { resourceId } = await idsFrom(context, "diaryId");
    const diary = await getDiaryRow(tenant.organizationId, resourceId);
    return Response.json({ diary });
  },

  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "EDIT");
    const { resourceId } = await idsFrom(context, "diaryId");

    const body = await request.json().catch(() => null);
    const parsed = updateDiarySchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Diário inválido.", {
        details: parsed.error.flatten(),
      });
    }

    const diary = await updateDiary({
      ...actorOf(tenant, request),
      diaryId: resourceId,
      ...parsed.data,
    });
    return Response.json({ diary });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "DELETE");
    const { resourceId } = await idsFrom(context, "diaryId");
    const result = await deleteDiary({ ...actorOf(tenant, request), diaryId: resourceId });
    return Response.json(result);
  },
});
