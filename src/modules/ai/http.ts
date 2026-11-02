import { requireTenantContext } from "@/core/tenant";

type Tenant = Awaited<ReturnType<typeof requireTenantContext>>;

export async function projectIdFrom(context: unknown): Promise<string | null> {
  const params = (await (context as { params: Promise<Record<string, string>> }).params) ?? {};
  return params.id ?? null;
}

export function actorOf(tenant: Tenant, request: Request) {
  return {
    organizationId: tenant.organizationId,
    actorId: tenant.userId,
    actorLabel: tenant.userEmail,
    correlationId: request.headers.get("x-correlation-id") ?? undefined,
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
  };
}