import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import {
  createOrganization,
  listUserOrganizations,
} from "@/modules/identity/services";
import { createOrganizationSchema } from "@/modules/identity/schemas";

// Organizações (§10):
// GET  → organizações do usuário autenticado
// POST → cria organização (fundador recebe papel ADMIN)

export const { GET, POST } = apiHandler({
  GET: async () => {
    const session = await auth();
    if (!session?.user?.id) {
      throw new AppError("UNAUTHENTICATED", "Sessão expirada ou ausente.");
    }
    const organizations = await listUserOrganizations(session.user.id);
    return Response.json({ organizations });
  },
  POST: async (request: NextRequest) => {
    const session = await auth();
    if (!session?.user?.id || !session.user.email) {
      throw new AppError("UNAUTHENTICATED", "Sessão expirada ou ausente.");
    }

    const body = await request.json().catch(() => null);
    const parsed = createOrganizationSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const organization = await createOrganization({
      name: parsed.data.name,
      slug: parsed.data.slug,
      actorId: session.user.id,
      actorEmail: session.user.email,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    });

    return Response.json({ organization }, { status: 201 });
  },
});
