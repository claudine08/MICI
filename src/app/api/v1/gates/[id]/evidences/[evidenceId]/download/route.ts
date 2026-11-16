import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { prisma } from "@/lib/prisma";

async function idsFrom(context: unknown): Promise<{ instanceId: string; evidenceId: string }> {
  const { id, evidenceId } = await (context as {
    params: Promise<{ id: string; evidenceId: string }>;
  }).params;
  if (!id || !evidenceId) throw new AppError("VALIDATION_ERROR", "Ids ausentes.");
  return { instanceId: id, evidenceId };
}

export const { GET } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "GATE", "VIEW");
    const { instanceId, evidenceId } = await idsFrom(context);

    const evidence = await prisma.gateEvidence.findFirst({
      where: {
        id: evidenceId,
        gateInstanceId: instanceId,
        organizationId: tenant.organizationId,
      },
    });
    if (!evidence || !evidence.content || !evidence.fileName || !evidence.mimeType) {
      throw new AppError("NOT_FOUND", "Arquivo de evidência não encontrado.");
    }

    const safeName = evidence.fileName.replace(/["\\]/g, "_");
    return new Response(new Uint8Array(evidence.content), {
      headers: {
        "Content-Type": evidence.mimeType,
        "Content-Length": String(evidence.sizeBytes ?? evidence.content.length),
        "Content-Disposition": `attachment; filename="${safeName}"`,
        ...(evidence.fileHash ? { "X-Content-Hash": evidence.fileHash } : {}),
      },
    });
  },
});