import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppTemplate } from "@/modules/integrations/whatsapp";

async function runCron(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    throw new AppError("FORBIDDEN", "Cron não autorizado.");
  }

  const today = new Date().toISOString().slice(0, 10);
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, organizationId: true },
  });

  let reminders = 0;
  let skipped = 0;

  for (const project of projects) {
    const hasDiary = await prisma.fieldDiary.findFirst({
      where: {
        projectId: project.id,
        organizationId: project.organizationId,
        entryDate: new Date(`${today}T00:00:00.000Z`),
        deletedAt: null,
      },
      select: { id: true },
    });
    if (hasDiary) continue;

    const members = await prisma.organizationMembership.findMany({
      where: { organizationId: project.organizationId, status: "ACTIVE", deletedAt: null },
      include: { user: { select: { phone: true, name: true } } },
    });

    for (const m of members) {
      const phone = m.user?.phone;
      if (!phone) {
        skipped += 1;
        continue;
      }
      const normalized = phone.replace(/\D/g, "");
      await sendWhatsAppTemplate({
        to: normalized,
        templateName: "mici_field_diary_reminder",
        params: [project.name, today],
      });
      reminders += 1;
    }
  }

  return Response.json({ ok: true, date: today, reminders, skipped });
}

export const { GET, POST } = apiHandler({
  GET: runCron,
  POST: runCron,
});