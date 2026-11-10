import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { prisma } from "@/lib/prisma";

async function idsFrom(context: unknown): Promise<{ meetingId: string; attachmentId: string }> {
  const { id, attachmentId } = await (context as { params: Promise<{ id: string; attachmentId: string }> }).params;
  if (!id || !attachmentId) throw new AppError("VALIDATION_ERROR", "Ids ausentes.");
  return { meetingId: id, attachmentId };
}

export const { GET, DELETE } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROJECT", "VIEW");
    const { meetingId, attachmentId } = await idsFrom(context);
    const attachment = await prisma.meetingAttachment.findFirst({
      where: { id: attachmentId, meetingId, organizationId: tenant.organizationId, deletedAt: null },
    });
    if (!attachment) throw new AppError("NOT_FOUND", "Anexo não encontrado.");
    return new Response(attachment.content, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `attachment; filename="${attachment.filename}"`,
        "Content-Length": String(attachment.size),
      },
    });
  },
  DELETE: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROJECT", "EDIT");
    const { meetingId, attachmentId } = await idsFrom(context);
    const attachment = await prisma.meetingAttachment.findFirst({
      where: { id: attachmentId, meetingId, organizationId: tenant.organizationId, deletedAt: null },
    });
    if (!attachment) throw new AppError("NOT_FOUND", "Anexo não encontrado.");
    await prisma.meetingAttachment.update({
      where: { id: attachment.id },
      data: { deletedAt: new Date(), deletedBy: tenant.userId },
    });
    return Response.json({ attachmentId: attachment.id });
  },
});