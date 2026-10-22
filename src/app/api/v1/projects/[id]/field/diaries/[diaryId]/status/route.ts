import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { transitionDiary } from "@/modules/field/diaries";
import { diaryTransitionSchema } from "@/modules/field/schemas";
import { actorOf, idsFrom } from "@/modules/field/http";

// Transição do diário (E12-US01): SUBMIT/CANCEL por FIELD:EDIT;
// APPROVE exige FIELD:APPROVE e REJECT exige FIELD:REJECT (o coordenador
// de campo não aprova o próprio diário — §38/BR-011 auditado).
export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    const { resourceId } = await idsFrom(context, "diaryId");

    const body = await request.json().catch(() => null);
    const parsed = diaryTransitionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Transição inválida.", {
        details: parsed.error.flatten(),
      });
    }

    if (parsed.data.action === "APPROVE") {
      assertPermission(tenant, "FIELD", "APPROVE");
    } else if (parsed.data.action === "REJECT") {
      assertPermission(tenant, "FIELD", "REJECT");
    } else {
      assertPermission(tenant, "FIELD", "EDIT");
    }

    const diary = await transitionDiary({
      ...actorOf(tenant, request),
      diaryId: resourceId,
      ...parsed.data,
    });
    return Response.json({ diary });
  },
});
