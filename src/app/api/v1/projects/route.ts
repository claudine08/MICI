import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listProjects } from "@/modules/portfolio/selectors";
import { createProject } from "@/modules/portfolio/projects";
import { createProjectSchema } from "@/modules/portfolio/schemas";

// Projetos (E03-US03):
// GET  → lista com resumo de gates (PROJECT:VIEW)
// POST → cria projeto + snapshot de gates do projeto (PROJECT:CREATE)

export const { GET, POST } = apiHandler({
  GET: async (request: NextRequest) => {
    const context = await requireTenantContext();
    assertPermission(context, "PROJECT", "VIEW");
    const url = new URL(request.url);
    const projects = await listProjects(context.organizationId, {
      search: url.searchParams.get("search") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });
    return Response.json({ projects });
  },

  POST: async (request: NextRequest) => {
    const context = await requireTenantContext();
    assertPermission(context, "PROJECT", "CREATE");

    const body = await request.json().catch(() => null);
    const parsed = createProjectSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados do projeto inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const project = await createProject({
      organizationId: context.organizationId,
      actorId: context.userId,
      actorLabel: context.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      ...parsed.data,
    });

    return Response.json({ project }, { status: 201 });
  },
});
