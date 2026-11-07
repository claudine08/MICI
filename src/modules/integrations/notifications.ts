// Notificações WhatsApp para membros da organização (fan-out de domain_events).
// Executa como job da fila (whatsapp.notify) — nunca roda no caminho síncrono
// de nenhuma operação do núcleo. Cada envio passa por safeCall (timeout +
// circuit breaker); uma queda do provedor não afeta o resto da fila.

import { prisma } from "@/lib/prisma";
import { sendWhatsAppTemplate } from "@/modules/integrations/whatsapp";
import { isProviderEnabled, safeCall } from "@/modules/integrations/isolation";

export interface NotifySummary {
  recipients: number;
  sent: number;
  failed: number;
  disabled: boolean;
  circuitOpen: boolean;
  lastError?: string;
}

export async function notifyEventMembers(eventId: string): Promise<NotifySummary> {
  const summary: NotifySummary = {
    recipients: 0,
    sent: 0,
    failed: 0,
    disabled: false,
    circuitOpen: false,
  };

  if (!isProviderEnabled("whatsapp")) {
    summary.disabled = true;
    return summary;
  }

  const event = await prisma.domainEvent.findUnique({ where: { id: eventId } });
  if (!event || !event.organizationId) return summary; // nada a notificar

  const templateName = process.env.WHATSAPP_TEMPLATE_NAME ?? "mici_alert";
  const members = await prisma.organizationMembership.findMany({
    where: { organizationId: event.organizationId, status: "ACTIVE", deletedAt: null },
    include: { user: { select: { phone: true } } },
  });

  for (const member of members) {
    const phone = member.user.phone;
    if (!phone) continue;
    summary.recipients += 1;
    const result = await safeCall(
      "whatsapp",
      "whatsapp",
      (signal) =>
        sendWhatsAppTemplate({
          to: phone,
          templateName,
          params: [event.eventType, String(event.aggregateId)],
          signal,
        }),
      { isFailure: (value) => !value.ok }
    );
    if (result.status === "ok") {
      summary.sent += 1;
    } else if (result.status === "skipped") {
      if (result.reason === "disabled") summary.disabled = true;
      else summary.circuitOpen = true;
    } else {
      summary.failed += 1;
      summary.lastError = result.error;
    }
  }

  return summary;
}
