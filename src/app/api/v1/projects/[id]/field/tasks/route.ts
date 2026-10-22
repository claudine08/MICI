import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listTasks } from "@/modules/field/selectors";
import { createTask } from "@/modules/field/tasks";
import { createTaskSchema } from "@/modules/field/schemas";
import { actorOf, projectIdFrom } from "@/modules/field/http";

// Tarefas de campo (E12-US03): GET lista (FIELD:VIEW), POST cria
// (FIELD:CREATE). Poucos campos — mobile-first (§38).
export const { GET, POST } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "VIEW");
    const projectId = await projectIdFrom(context);
    const tasks = await listTasks(tenant.organizationId, projectId);
    return Response.json({ tasks });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "CREATE");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Tarefa inválida.", {
        details: parsed.error.flatten(),
      });
    }

    const task = await createTask({ ...actorOf(tenant, request), projectId, ...parsed.data });
    return Response.json({ task }, { status: 201 });
  },
});
