import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { requireTenantContext, assertPermission } from "@/core/tenant";
import { transitionGate, removeGateEvidence, listProjectGateInstances } from "@/modules/gates/instances";
import { prisma } from "@/lib/prisma";
import { transitionGateSchema } from "@/modules/portfolio/schemas";

async function instanceIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do gate ausente.");
  return id;
}

// Instância de gate (E06):
// GET    → detalhe com critérios/evidências/aprovações (GATE:VIEW)
// PATCH  → transição de estado (start/submit/analyze → GATE:EDIT;
//          approve/waive → GATE:APPROVE; reject → GATE:REJECT) (§16.3)
// DELETE ?evidenceId= → remove evidência antes da decisão (GATE:EDIT)

export const { GET, PATCH, DELETE } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "GATE", "VIEW");
    const instanceId = await instanceIdFrom(context);

    const instance = await prisma.gateInstance.findFirst({
      where: { id: instanceId, organizationId: tenant.organizationId },
      select: { projectId: true },
    });
    if (!instance) {
      throw new AppError("NOT_FOUND", "Gate não encontrado nesta organização.");
    }

    const gates = await listProjectGateInstances(
      tenant.organizationId,
      instance.projectId,
      tenant.userId
    );
    const gate = gates.find((item) => item.id === instanceId);
    if (!gate) {
      throw new AppError("NOT_FOUND", "Gate não encontrado nesta organização.");
    }
    return Response.json({ gate });
  },

  PATCH: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    const instanceId = await instanceIdFrom(context);

    const body = await request.json().catch(() => null);
    const parsed = transitionGateSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Ação inválida.", {
        details: parsed.error.flatten(),
      });
    }

    // Permissão por ação (RBAC): aprovar/dispensar/rejeitar exigem ação própria.
    const action = parsed.data.action;
    if (action === "approve" || action === "waive") {
      assertPermission(tenant, "GATE", "APPROVE");
    } else if (action === "reject") {
      assertPermission(tenant, "GATE", "REJECT");
    } else {
      assertPermission(tenant, "GATE", "EDIT");
    }

    const gate = await transitionGate({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      instanceId,
      action,
      reason: parsed.data.reason,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    });

    return Response.json({ gate });
  },

  DELETE: async (request: NextRequest, context) => {
    const tenant = await requireTenantContext();
    assertPermission(tenant, "GATE", "EDIT");
    const instanceId = await instanceIdFrom(context);
    const evidenceId = new URL(request.url).searchParams.get("evidenceId");
    if (!evidenceId) {
      throw new AppError("VALIDATION_ERROR", "evidenceId obrigatório.");
    }

    const gate = await removeGateEvidence({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      actorLabel: tenant.userEmail,
      instanceId,
      evidenceId,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    });

    return Response.json({ gate });
  },
});
