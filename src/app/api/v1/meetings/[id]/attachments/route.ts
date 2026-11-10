import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { prisma } from "@/lib/prisma";
import crypto from "node:crypto";

async function idFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id ausente.");
  return id;
}

const ALLOWED_MIME = new Set(["application/pdf", "image/png", "image/jpeg", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
const MAX_SIZE = 4 * 1024 * 1024;

export const { GET, POST } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROJECT", "VIEW");
    const id = await idFrom(context);
    const attachments = await prisma.meetingAttachment.findMany({
      where: { meetingId: id, organizationId: tenant.organizationId, deletedAt: null },
      select: { id: true, filename: true, mimeType: true, size: true, createdAt: true, uploadedBy: true },
      orderBy: { createdAt: "desc" },
    });
    return Response.json({ attachments });
  },
  POST: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "PROJECT", "EDIT");
    const id = await idFrom(context);
    const meeting = await prisma.meeting.findFirst({ where: { id, organizationId: tenant.organizationId, deletedAt: null } });
    if (!meeting) throw new AppError("NOT_FOUND", "Reunião não encontrada.");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("VALIDATION_ERROR", "Arquivo ausente.");
    if (file.size > MAX_SIZE) throw new AppError("VALIDATION_ERROR", "Arquivo excede 4 MB.");
    if (!ALLOWED_MIME.has(file.type)) throw new AppError("VALIDATION_ERROR", "Tipo de arquivo não permitido.");
    const buffer = Buffer.from(await file.arrayBuffer());
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const attachment = await prisma.meetingAttachment.create({
      data: {
        organizationId: tenant.organizationId,
        meetingId: id,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        content: buffer,
        sha256,
        uploadedBy: tenant.userId,
      },
    });
    return Response.json({ attachment: { id: attachment.id, filename: attachment.filename, mimeType: attachment.mimeType, size: attachment.size } }, { status: 201 });
  },
});