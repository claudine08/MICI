import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const bodySchema = z.object({
  showAgain: z.boolean(),
});

export const { PATCH } = apiHandler({
  PATCH: async (request: NextRequest) => {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) throw new AppError("UNAUTHENTICATED", "Sessão expirada ou ausente.");

    const body = (await request.json().catch(() => null)) as { showAgain?: unknown } | null;
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dados inválidos.", {
        details: parsed.error.flatten(),
      });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        onboardingGuideDismissedAt: parsed.data.showAgain ? null : new Date(),
      },
    });

    return Response.json({ showAgain: parsed.data.showAgain });
  },
});