import { prisma } from "@/lib/prisma";
import { createDiary } from "@/modules/field/diaries";
import { createConstraint } from "@/modules/field/constraints";
import { createProgress } from "@/modules/field/progress";
import { createPhoto, preparePhotoUpload } from "@/modules/field/photos";
import { sendWhatsAppTemplate } from "@/modules/integrations/whatsapp";

export interface WhatsAppInboundMessage {
  from: string;
  text: string;
  messageId?: string;
  imageMediaId?: string;
  imageMimeType?: string;
  imageCaption?: string;
}

async function downloadWhatsAppMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string; fileName: string } | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const metaRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!metaRes.ok) return null;
    const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
    if (!meta.url) return null;
    const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!fileRes.ok) return null;
    const buf = Buffer.from(await fileRes.arrayBuffer());
    const mimeType = meta.mime_type ?? "image/jpeg";
    const ext = mimeType.split("/")[1] || "jpg";
    return { buffer: buf, mimeType, fileName: `${mediaId}.${ext}` };
  } catch {
    return null;
  }
}

export interface WhatsAppInboundResult {
  processed: number;
  created: number;
  skipped: number;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export async function handleInboundWhatsApp(messages: WhatsAppInboundMessage[]): Promise<WhatsAppInboundResult> {
  let created = 0;
  let skipped = 0;

  for (const msg of messages) {
    const phone = normalizePhone(msg.from);
    if (!phone || !msg.text?.trim()) {
      skipped += 1;
      continue;
    }

    const candidates = await prisma.user.findMany({
      where: { phone: { not: null } },
      select: { id: true, name: true, phone: true },
    });
    const user = candidates.find((u) => normalizePhone(u.phone!) === phone);
    if (!user) {
      skipped += 1;
      continue;
    }

    // Projeto mais recente do usuário (membro ACTIVE)
    const orgMembership = await prisma.organizationMembership.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: { organizationId: true },
    });
    if (!orgMembership) {
      skipped += 1;
      continue;
    }
    const project = await prisma.project.findFirst({
      where: { organizationId: orgMembership.organizationId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!project) {
      skipped += 1;
      continue;
    }
    const membership = { projectId: project.id, organizationId: orgMembership.organizationId };

    const today = new Date().toISOString().slice(0, 10);
    const text = msg.text.trim();
    const lower = text.toLowerCase();

    // Fatia 2: comando de avanço físico — "avanco A001 50%" / "avanço A001 50"
    // (também aceita "progresso"/"progress"). Critério BR-006 obrigatório.
    const progressMatch = /^(?:avan[cç]o|progresso|progress)[:\s]+(\S+)\s+(\d{1,3})\s*%?(.*)$/i.exec(text);
    try {
      if (msg.imageMediaId) {
        const downloaded = await downloadWhatsAppMedia(msg.imageMediaId);
        if (!downloaded) {
          throw new Error("media download failed");
        }
        const file = preparePhotoUpload({
          name: downloaded.fileName,
          type: downloaded.mimeType,
          size: downloaded.buffer.length,
          buffer: downloaded.buffer,
        });

        // Vinculação automática: legenda pode ser código de atividade (A001) ou tarefa (FT001).
        let activityId: string | null = null;
        let taskId: string | null = null;
        const caption = (msg.imageCaption || text || "").trim();
        const activityCodeMatch = caption.match(/^A\d{3,}$/i);
        if (activityCodeMatch) {
          const act = await prisma.scheduleActivity.findFirst({
            where: {
              projectId: membership.projectId,
              organizationId: membership.organizationId,
              code: activityCodeMatch[0].toUpperCase(),
              deletedAt: null,
            },
            select: { id: true },
          });
          activityId = act?.id ?? null;
        }
        const taskCodeMatch = caption.match(/^FT\d{3,}$/i);
        if (taskCodeMatch) {
          const t = await prisma.fieldTask.findFirst({
            where: {
              projectId: membership.projectId,
              organizationId: membership.organizationId,
              code: taskCodeMatch[0].toUpperCase(),
              deletedAt: null,
            },
            select: { id: true },
          });
          taskId = t?.id ?? null;
        }
        const diary = await prisma.fieldDiary.findFirst({
          where: {
            projectId: membership.projectId,
            organizationId: membership.organizationId,
            entryDate: new Date(`${today}T00:00:00.000Z`),
            deletedAt: null,
          },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });

        const photo = await createPhoto({
          organizationId: membership.organizationId,
          projectId: membership.projectId,
          actorId: user.id,
          actorLabel: user.name ?? "WhatsApp",
          correlationId: msg.messageId,
          diaryId: diary?.id ?? null,
          taskId,
          activityId,
          caption: caption || "Foto via WhatsApp",
          file,
        });
        await sendWhatsAppTemplate({
          to: phone,
          templateName: "mici_field_photo_confirm",
          params: [photo.code ?? ""],
        });
      } else if (lower.startsWith("restricao:") || lower.startsWith("restrição:")) {
        const title = text.split(":").slice(1).join(":").trim() || "Restrição via WhatsApp";
        const constraint = await createConstraint({
          organizationId: membership.organizationId,
          projectId: membership.projectId,
          actorId: user.id,
          actorLabel: user.name ?? "WhatsApp",
          title,
          description: text,
          type: "EXTERNAL",
          priority: "MEDIUM",
        });
        await sendWhatsAppTemplate({
          to: phone,
          templateName: "mici_field_constraint_confirm",
          params: [constraint.code ?? "", title],
        });
      } else if (progressMatch) {
        const activityCode = progressMatch[1].trim().toUpperCase();
        const percent = Math.min(100, Math.max(0, Number(progressMatch[2])));
        const extra = progressMatch[3]?.trim() || "";
        const activity = await prisma.scheduleActivity.findFirst({
          where: {
            projectId: membership.projectId,
            organizationId: membership.organizationId,
            code: activityCode,
            deletedAt: null,
          },
          select: { id: true, code: true },
        });
        if (!activity) {
          // Atividade não encontrada: registra como diário para não perder o reporte.
          const diary = await createDiary({
            organizationId: membership.organizationId,
            projectId: membership.projectId,
            actorId: user.id,
            actorLabel: user.name ?? "WhatsApp",
            entryDate: today,
            occurrences: text,
            activities: "Reporte via WhatsApp (atividade não encontrada)",
          });
          await sendWhatsAppTemplate({
            to: phone,
            templateName: "mici_field_report_confirm",
            params: [diary.code ?? "", today],
          });
        } else {
          const measurement = await createProgress({
            organizationId: membership.organizationId,
            projectId: membership.projectId,
            actorId: user.id,
            actorLabel: user.name ?? "WhatsApp",
            correlationId: msg.messageId,
            measurementDate: today,
            activityId: activity.id,
            method: "PERCENT_COMPLETE",
            progressPercent: percent,
            criterion: "Reporte via WhatsApp",
            notes: extra || text,
          });
          await sendWhatsAppTemplate({
            to: phone,
            templateName: "mici_field_progress_confirm",
            params: [activity.code, String(percent), measurement.code ?? ""],
          });
        }
      } else {
        const diary = await createDiary({
          organizationId: membership.organizationId,
          projectId: membership.projectId,
          actorId: user.id,
          actorLabel: user.name ?? "WhatsApp",
          entryDate: today,
          occurrences: text,
          activities: "Reporte via WhatsApp",
        });
        await sendWhatsAppTemplate({
          to: phone,
          templateName: "mici_field_report_confirm",
          params: [diary.code ?? "", today],
        });
      }
      created += 1;
    } catch {
      skipped += 1;
    }
  }

  return { processed: messages.length, created, skipped };
}

export function parseMetaPayload(body: unknown): WhatsAppInboundMessage[] {
  const out: WhatsAppInboundMessage[] = [];
  const payload = body as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            from?: string;
            id?: string;
            type?: string;
            text?: { body?: string };
            image?: { id?: string; mime_type?: string; caption?: string };
          }>;
        };
      }>;
    }>;
  };
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      for (const m of change?.value?.messages ?? []) {
        if (!m?.from) continue;
        if (m.type === "image" && m.image?.id) {
          out.push({
            from: m.from,
            text: m.image.caption ?? "",
            messageId: m.id,
            imageMediaId: m.image.id,
            imageMimeType: m.image.mime_type,
            imageCaption: m.image.caption,
          });
        } else if (m?.text?.body) {
          out.push({ from: m.from, text: m.text.body, messageId: m.id });
        }
      }
    }
  }
  return out;
}