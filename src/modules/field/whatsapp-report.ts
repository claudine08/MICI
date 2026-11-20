import { prisma } from "@/lib/prisma";
import { createDiary } from "@/modules/field/diaries";
import { createConstraint } from "@/modules/field/constraints";
import { sendWhatsAppTemplate } from "@/modules/integrations/whatsapp";

export interface WhatsAppInboundMessage {
  from: string;
  text: string;
  messageId?: string;
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

    const user = await prisma.user.findFirst({ where: { phone }, select: { id: true, name: true } });
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
    try {
      if (lower.startsWith("restricao:") || lower.startsWith("restrição:")) {
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
  const payload = body as { entry?: Array<{ changes?: Array<{ value?: { messages?: Array<{ from?: string; id?: string; text?: { body?: string } }> } }> }> };
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      for (const m of change?.value?.messages ?? []) {
        if (m?.from && m?.text?.body) {
          out.push({ from: m.from, text: m.text.body, messageId: m.id });
        }
      }
    }
  }
  return out;
}