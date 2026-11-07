import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { updateMyPhoneSchema } from "@/modules/identity/schemas";

// Autoatualização do próprio telefone (canal de notificação WhatsApp).
// Não exige USER:EDIT — o telefone é dado do próprio usuário, não privilégio;
// o valor passa pelo mesmo schema E.164 usado pelo admin em /administracao/usuarios.

export const { PATCH } = apiHandler({
  PATCH: async (request: NextRequest) => {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) throw new AppError("UNAUTHENTICATED", "Sessão expirada ou ausente.");

    const body = (await request.json().catch(() => null)) as { phone?: unknown } | null;
    // UI envia string vazia para limpar; o schema aceita null (E.164 ou null).
    const phone = body && typeof body === "object" ? (body.phone === "" ? null : body.phone) : body;
    const parsed = updateMyPhoneSchema.safeParse({ phone });
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true },
    });
    if (!user) throw new AppError("SESSION_USER_NOT_FOUND", "Usuário da sessão não encontrado.");

    if (user.phone !== parsed.data.phone) {
      await prisma.user.update({ where: { id: userId }, data: { phone: parsed.data.phone } });
      await prisma.auditEvent.create({
        data: {
          actorId: userId,
          actorLabel: user.email,
          objectType: "User",
          objectId: userId,
          action: "UPDATE",
          oldValue: { phone: user.phone },
          newValue: { phone: parsed.data.phone },
          correlationId: request.headers.get("x-correlation-id") ?? null,
          ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        },
      });
    }

    return Response.json({ phone: parsed.data.phone });
  },
});
