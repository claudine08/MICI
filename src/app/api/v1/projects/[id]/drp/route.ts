import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getDrpDocument } from "@/modules/requirements/selectors";
import { renderDrpMarkdown } from "@/modules/requirements/engine";

async function projectIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do projeto ausente.");
  return id;
}

// DRP do projeto (E04-US05, §20): GET → documento JSON;
// ?format=markdown → exportação em Markdown (leitura, REQUIREMENT:VIEW).

export const { GET } = apiHandler({
  GET: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "REQUIREMENT", "VIEW");
    const projectId = await projectIdFrom(context);

    const document = await getDrpDocument(
      tenant.organizationId,
      projectId,
      tenant.userName || tenant.userEmail
    );

    if (request.nextUrl.searchParams.get("format") === "markdown") {
      return new Response(renderDrpMarkdown(document), {
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "content-disposition": `inline; filename="drp-${document.project.code}.md"`,
        },
      });
    }

    return Response.json({ drp: document });
  },
});
