import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { listRequirements } from "@/modules/requirements/selectors";
import { createRequirement } from "@/modules/requirements/requirements";
import { createRequirementSchema } from "@/modules/requirements/schemas";
import { isRequirementStatus, REQUIREMENT_CATEGORIES } from "@/modules/requirements/engine";

async function projectIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do projeto ausente.");
  return id;
}

// Requisitos do projeto (E04-US01, BR-015):
// GET  → lista com filtros status/category/q (REQUIREMENT:VIEW);
// POST → cria requisito (REQUIREMENT:CREATE), código auto se omitido.

export const { GET, POST } = apiHandler({
  GET: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "REQUIREMENT", "VIEW");
    const projectId = await projectIdFrom(context);

    const params = request.nextUrl.searchParams;
    const status = params.get("status");
    const category = params.get("category");
    if (status && !isRequirementStatus(status)) {
      throw new AppError("VALIDATION_ERROR", `Status inválido: ${status}.`);
    }
    if (category && !REQUIREMENT_CATEGORIES.includes(category as never)) {
      throw new AppError("VALIDATION_ERROR", `Categoria inválida: ${category}.`);
    }

    const requirements = await listRequirements(tenant.organizationId, {
      projectId,
      status: status ?? undefined,
      category: category ?? undefined,
      search: params.get("q") ?? undefined,
    });

    return Response.json({ requirements });
  },

  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "REQUIREMENT", "CREATE");
    const projectId = await projectIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = createRequirementSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados do requisito inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const requirement = await createRequirement({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      projectId,
      ...parsed.data,
    });

    return Response.json({ requirement }, { status: 201 });
  },
});
