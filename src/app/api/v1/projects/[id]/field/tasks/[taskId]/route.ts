import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getTaskRow } from "@/modules/field/selectors";
import { updateTask, deleteTask } from "@/modules/field/tasks";
import { updateTaskSchema } from "@/modules/field/schemas";
import { actorOf, idsFrom } from "@/modules/field/http";

// Tarefa individual (E12-US03): GET detalhe, PATCH edita (bloqueado em
// DONE/CANCELLED), DELETE lógico (só OPEN).
export const { GET, PATCH, DELETE } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "VIEW");
    const { resourceId } = await idsFrom(context, "taskId");
    const task = await getTaskRow(tenant.organizationId, resourceId);
    return Response.json({ task });
  },

  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "EDIT");
    const { resourceId } = await idsFrom(context, "taskId");

    const body = await request.json().catch(() => null);
    const parsed = updateTaskSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Tarefa inválida.", {
        details: parsed.error.flatten(),
      });
    }

    const task = await updateTask({ ...actorOf(tenant, request), taskId: resourceId, ...parsed.data });
    return Response.json({ task });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "DELETE");
    const { resourceId } = await idsFrom(context, "taskId");
    const result = await deleteTask({ ...actorOf(tenant, request), taskId: resourceId });
    return Response.json(result);
  },
});
