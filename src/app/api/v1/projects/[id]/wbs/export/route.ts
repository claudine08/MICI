import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getWbsTree, assertWbsProject } from "@/modules/wbs/selectors";
import { buildWbsExport, wbsToCsv } from "@/modules/wbs/engine";

async function projectIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do projeto ausente.");
  return id;
}

// Exportação da árvore (E05-US04):
// GET → JSON com caminhos (?format=json, padrão) ou CSV (?format=csv).
// Export é leitura do dado vivo ⇒ permissão WBS:VIEW.

export const { GET } = apiHandler({
  GET: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "WBS", "VIEW");
    const projectId = await projectIdFrom(context);

    const [project, tree] = await Promise.all([
      assertWbsProject(tenant.organizationId, projectId),
      getWbsTree(tenant.organizationId, projectId),
    ]);
    const document = buildWbsExport(tree, { code: project.code, name: project.name });

    if (request.nextUrl.searchParams.get("format") === "csv") {
      return new Response(wbsToCsv(tree), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="wbs-${project.code}.csv"`,
        },
      });
    }

    return Response.json({ export: document });
  },
});
