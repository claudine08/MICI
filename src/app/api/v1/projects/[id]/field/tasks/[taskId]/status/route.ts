import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { transitionTask } from "@/modules/field/tasks";
import { taskTransitionSchema } from "@/modules/field/schemas";
import { actorOf, idsFrom } from "@/modules/field/http";

// Transição da tarefa de campo (E12-US03): START/BLOCK/UNBLOCK/COMPLETE/
// CANCEL/REOPEN — todas por FIELD:EDIT (operações de campo, sem aprovação).
export const { POST } = apiHandler({
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "EDIT");
    const { resourceId } = await idsFrom(context, "taskId");

    const body = await request.json().catch(() => null);
    const parsed = taskTransitionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Transição inválida.", {
        details: parsed.error.flatten(),
      });
    }

    const task = await transitionTask({
      ...actorOf(tenant, request),
      taskId: resourceId,
      ...parsed.data,
    });
    return Response.json({ task });
  },
});
