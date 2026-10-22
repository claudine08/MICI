import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { getPhotoContent } from "@/modules/field/selectors";
import { updatePhoto, deletePhoto } from "@/modules/field/photos";
import { updatePhotoSchema } from "@/modules/field/schemas";
import { actorOf, idsFrom } from "@/modules/field/http";

// Foto individual (E12-US02): GET devolve a imagem (FIELD:VIEW, inline),
// PATCH edita legenda/momento (FIELD:EDIT), DELETE exclui logicamente.
export const { GET, PATCH, DELETE } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "VIEW");
    const { resourceId } = await idsFrom(context, "photoId");

    const file = await getPhotoContent(tenant.organizationId, resourceId);
    const safeName = file.fileName.replace(/["\\]/g, "_");
    return new Response(new Uint8Array(file.content), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.sizeBytes),
        "Content-Disposition": `inline; filename="${safeName}"`,
        "X-Content-Hash": file.hash,
        "Cache-Control": "private, max-age=300",
      },
    });
  },

  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "EDIT");
    const { resourceId } = await idsFrom(context, "photoId");

    const body = await request.json().catch(() => null);
    const parsed = updatePhotoSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Foto inválida.", {
        details: parsed.error.flatten(),
      });
    }

    const photo = await updatePhoto({
      ...actorOf(tenant, request),
      photoId: resourceId,
      ...parsed.data,
    });
    return Response.json({ photo });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "FIELD", "DELETE");
    const { resourceId } = await idsFrom(context, "photoId");
    const result = await deletePhoto({ ...actorOf(tenant, request), photoId: resourceId });
    return Response.json(result);
  },
});
