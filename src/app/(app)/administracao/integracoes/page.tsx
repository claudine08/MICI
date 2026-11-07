import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { prisma } from "@/lib/prisma";
import { NoPermission } from "@/components/shell/no-permission";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isProviderEnabled, circuitState } from "@/modules/integrations/isolation";
import { listWebhookEndpoints, listWebhookDeliveries } from "@/modules/integrations/webhooks";
import {
  WebhooksPanel,
  type WebhookDeliveryRow,
  type WebhookEndpointRow,
} from "@/components/integrations/webhooks-panel";

export const metadata = { title: "Integrações" };

// Espelha os `crons` do vercel.json (fonte de verdade do agendamento no Vercel).
const CRON_SCHEDULE = [
  { path: "/api/v1/cron/webhooks", schedule: "03:00 UTC (1x/dia)", what: "Outbox domain_events + fila de jobs" },
  { path: "/api/v1/cron/notifications", schedule: "15:00 UTC (1x/dia)", what: "Fila de jobs (e-mail, WhatsApp)" },
  { path: "/api/v1/cron/backup", schedule: "04:00 UTC (1x/dia)", what: "Branch de backup no Neon" },
];

function ProviderCard({
  name,
  detail,
  enabled,
  configured,
}: {
  name: string;
  detail: string;
  enabled: boolean;
  configured: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="text-sm">{name}</CardTitle>
          <CardDescription>{detail}</CardDescription>
        </div>
        <Badge variant={enabled ? "success" : "destructive"}>
          {enabled ? "habilitado" : "desligado"}
        </Badge>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        {configured ? "Credenciais configuradas." : "Credenciais ausentes — operará em modo dev/fallback."}
      </CardContent>
    </Card>
  );
}

export default async function IntegracoesPage() {
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "INTEGRATION", "VIEW")) {
    return <NoPermission required="INTEGRATION:VIEW" />;
  }

  const [endpoints, deliveries, jobsPending, jobsRunning, jobsFailed, eventsPending, eventsFailed, failedJobs] =
    await Promise.all([
      listWebhookEndpoints(context.organizationId),
      listWebhookDeliveries(context.organizationId, undefined, 20),
      prisma.jobQueue.count({ where: { status: "PENDING" } }),
      prisma.jobQueue.count({ where: { status: "RUNNING" } }),
      prisma.jobQueue.count({ where: { status: "FAILED" } }),
      prisma.domainEvent.count({ where: { status: "PENDING" } }),
      prisma.domainEvent.count({ where: { status: "FAILED" } }),
      prisma.jobQueue.findMany({
        where: { status: "FAILED" },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
    ]);

  const endpointRows: WebhookEndpointRow[] = endpoints.map((endpoint) => ({
    id: endpoint.id,
    url: endpoint.url,
    events: endpoint.events ?? [],
    isActive: endpoint.isActive,
    description: endpoint.description,
    createdAt: endpoint.createdAt.toISOString(),
    deliveryCount: endpoint._count.deliveries,
    // Estado do circuit breaker desta instância serverless.
    circuit: circuitState(`webhook:${endpoint.id}`),
  }));

  const deliveryRows: WebhookDeliveryRow[] = deliveries.map((delivery) => ({
    id: delivery.id,
    endpointId: delivery.endpointId,
    eventType: delivery.eventType,
    status: delivery.status,
    attempts: delivery.attempts,
    lastError: delivery.lastError,
    deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
    createdAt: delivery.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Integrações</h1>
        <p className="text-sm text-muted-foreground">
          Provedores, webhooks outbound da organização {context.organizationName}, fila de jobs e
          agendamentos.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <ProviderCard
          name="E-mail (Resend)"
          detail="Convites e aprovações por e-mail"
          enabled={isProviderEnabled("email")}
          configured={Boolean(process.env.RESEND_API_KEY)}
        />
        <ProviderCard
          name="WhatsApp (Meta Cloud API)"
          detail="Notificações para membros com telefone"
          enabled={isProviderEnabled("whatsapp")}
          configured={Boolean(
            process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN
          )}
        />
        <ProviderCard
          name="Webhooks outbound"
          detail="Entregas de eventos para sistemas do cliente"
          enabled={isProviderEnabled("webhook")}
          configured={true}
        />
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold">Webhooks</h2>
          <p className="text-sm text-muted-foreground">
            Endpoints desta organização e as últimas entregas registradas.
          </p>
        </div>
        <WebhooksPanel
          organizationId={context.organizationId}
          endpoints={endpointRows}
          deliveries={deliveryRows}
          canCreate={can(permissions, "INTEGRATION", "CREATE")}
          canEdit={can(permissions, "INTEGRATION", "EDIT")}
          canDelete={can(permissions, "INTEGRATION", "DELETE")}
          canAdmin={can(permissions, "INTEGRATION", "ADMIN")}
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Fila de jobs (job_queue)</CardTitle>
            <CardDescription>Processada pelos crons de webhooks e notificações.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="warning">pendentes: {jobsPending}</Badge>
              <Badge variant="secondary">em execução: {jobsRunning}</Badge>
              <Badge variant="destructive">falhas: {jobsFailed}</Badge>
            </div>
            {failedJobs.length > 0 && (
              <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                {failedJobs.map((job) => (
                  <li key={job.id} className="truncate" title={job.lastError ?? undefined}>
                    <span className="font-medium text-foreground">{job.type}</span> · tentativa{" "}
                    {job.attempts}/{job.maxAttempts} · {job.lastError ?? "sem detalhe"}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Outbox de eventos (domain_events)</CardTitle>
            <CardDescription>Consumido apenas pelo cron /api/v1/cron/webhooks.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-sm">
            <Badge variant="warning">pendentes: {eventsPending}</Badge>
            <Badge variant="destructive">falhas: {eventsFailed}</Badge>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold">Agendamentos (Vercel Cron)</h2>
          <p className="text-sm text-muted-foreground">
            Definidos em <code>vercel.json</code>; protegidos por{" "}
            <code>CRON_SECRET</code> (Bearer). Só rodam em produção.
          </p>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-2.5">Rota</th>
                <th className="px-4 py-2.5">Agendamento</th>
                <th className="px-4 py-2.5">Função</th>
              </tr>
            </thead>
            <tbody>
              {CRON_SCHEDULE.map((cron) => (
                <tr key={cron.path} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs">{cron.path}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{cron.schedule}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{cron.what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
