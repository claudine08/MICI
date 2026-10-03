import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { ACTIVE_ORG_COOKIE, getTenantContext } from "@/core/tenant";
import { recordAudit } from "@/core/audit";
import { listUserOrganizations } from "@/modules/identity/services";
import { activateOrganizationSchema } from "@/modules/identity/schemas";

// Contexto de sessão/tenant (§10.4):
// GET  → sessão + organizações do usuário + contexto ativo + permissões
// POST → seleciona (ativa) a organização do contexto via cookie validado

export const { GET, POST } = apiHandler({
  GET: async () => {
    const session = await auth();
    if (!session?.user?.id) {
      throw new AppError("UNAUTHENTICATED", "Sessão expirada ou ausente.");
    }

    const organizations = await listUserOrganizations(session.user.id);
    const context = await getTenantContext();

    return Response.json({
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
      },
      organizations,
      active: context
        ? {
            organizationId: context.organizationId,
            organizationName: context.organizationName,
            roleCodes: context.roleCodes,
            permissions: [...context.permissions],
          }
        : null,
    });
  },
  POST: async (request: NextRequest) => {
    const session = await auth();
    if (!session?.user?.id) {
      throw new AppError("UNAUTHENTICATED", "Sessão expirada ou ausente.");
    }

    const body = await request.json().catch(() => null);
    const parsed = activateOrganizationSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "organizationId inválido.", {
        details: parsed.error.flatten(),
      });
    }

    const membership = await prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: parsed.data.organizationId,
          userId: session.user.id,
        },
      },
      include: { organization: true },
    });

    if (
      !membership ||
      membership.deletedAt ||
      membership.status !== "ACTIVE" ||
      membership.organization.deletedAt ||
      membership.organization.status !== "ACTIVE"
    ) {
      throw new AppError("NOT_FOUND", "Organização não encontrada para este usuário.");
    }

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_ORG_COOKIE, membership.organizationId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      secure: process.env.NODE_ENV === "production",
    });

    await recordAudit({
      organizationId: membership.organizationId,
      actorId: session.user.id,
      actorLabel: session.user.email ?? null,
      objectType: "Session",
      objectId: membership.organizationId,
      action: "ACTIVATE_ORGANIZATION",
      newValue: { organizationId: membership.organizationId },
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      correlationId: request.headers.get("x-correlation-id") ?? null,
    });

    return Response.json({
      active: {
        organizationId: membership.organizationId,
        organizationName: membership.organization.name,
      },
    });
  },
});
