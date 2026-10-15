import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { updateCommitment, deleteCommitment } from "@/modules/cost/commitments";
import { updateCommitmentSchema } from "@/modules/cost/schemas";

async function commitmentIdFrom(context: unknown): Promise<string> {
  const { commitmentId } = await (context as { params: Promise<{ commitmentId: string }> }).params;
  if (!commitmentId) throw new AppError("VALIDATION_ERROR", "Id do compromisso ausente.");
  return commitmentId;
}

// Compromisso individual (E08 §29): PATCH edita/status (COST:EDIT),
// DELETE exclui logicamente (COST:DELETE) — bloqueado se houver realizado.
export const { PATCH, DELETE } = apiHandler({
  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COST", "EDIT");
    const commitmentId = await commitmentIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = updateCommitmentSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados inválidos.", { details: parsed.error.flatten() });
    }

    const commitment = await updateCommitment({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      commitmentId,
      ...parsed.data,
    });
    return Response.json({ commitment });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "COST", "DELETE");
    const commitmentId = await commitmentIdFrom(context);

    const result = await deleteCommitment({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      commitmentId,
    });
    return Response.json(result);
  },
});
