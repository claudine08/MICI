import { AppError } from "@/core/errors";
import { requireTenantContext } from "@/core/tenant";

type Tenant = Awaited<ReturnType<typeof requireTenantContext>>;

export async function projectIdFrom(context: unknown): Promise<string> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw new AppError("VALIDATION_ERROR", "Id do projeto ausente.");
  return id;
}

export async function idsFrom(
  context: unknown,
  key: string
): Promise<{ projectId: string; resourceId: string }> {
  const params = (await (context as { params: Promise<Record<string, string>> }).params) ?? {};
  const projectId = params.id;
  const resourceId = params[key];
  if (!projectId) throw new AppError("VALIDATION_ERROR", "Id do projeto ausente.");
  if (!resourceId) throw new AppError("VALIDATION_ERROR", `Id do recurso '${key}' ausente.`);
  return { projectId, resourceId };
}

export async function idFrom(context: unknown, key: string): Promise<string> {
  const params = (await (context as { params: Promise<Record<string, string>> }).params) ?? {};
  const resourceId = params[key];
  if (!resourceId) throw new AppError("VALIDATION_ERROR", `Id do recurso '${key}' ausente.`);
  return resourceId;
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

