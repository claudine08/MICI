import Link from "next/link";
import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { listAuditEvents } from "@/core/audit";
import { NoPermission } from "@/components/shell/no-permission";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Auditoria" };

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "medium",
});

interface AuditSearchParams {
  objectType?: string;
  objectId?: string;
  action?: string;
  page?: string;
}

function buildQuery(params: AuditSearchParams, page: number): string {
  const query = new URLSearchParams();
  if (params.objectType) query.set("objectType", params.objectType);
  if (params.objectId) query.set("objectId", params.objectId);
  if (params.action) query.set("action", params.action);
  if (page > 1) query.set("page", String(page));
  const value = query.toString();
  return value ? `?${value}` : "";
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<AuditSearchParams>;
}) {
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "AUDIT", "VIEW")) {
    return <NoPermission required="AUDIT:VIEW" />;
  }

  const params = await searchParams;
  const page = Number(params.page ?? "1") || 1;
  const result = await listAuditEvents({
    organizationId: context.organizationId,
    objectType: params.objectType || undefined,
    objectId: params.objectId || undefined,
    action: params.action || undefined,
    page,
    pageSize: 50,
  });

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Auditoria</h1>
        <p className="text-sm text-muted-foreground">
          Trilha append-only da organização {context.organizationName} · {result.total}{" "}
          evento{result.total === 1 ? "" : "s"} (§54).
        </p>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="objectType" className="text-xs font-medium text-muted-foreground">
            Tipo de objeto
          </label>
          <input
            id="objectType"
            name="objectType"
            defaultValue={params.objectType ?? ""}
            placeholder="Membership, Organization…"
            className="h-9 w-44 rounded-md border border-border bg-surface px-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="objectId" className="text-xs font-medium text-muted-foreground">
            Id do objeto
          </label>
          <input
            id="objectId"
            name="objectId"
            defaultValue={params.objectId ?? ""}
            placeholder="uuid"
            className="h-9 w-72 rounded-md border border-border bg-surface px-2 font-mono text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="action" className="text-xs font-medium text-muted-foreground">
            Ação
          </label>
          <input
            id="action"
            name="action"
            defaultValue={params.action ?? ""}
            placeholder="CREATE, UPDATE…"
            className="h-9 w-36 rounded-md border border-border bg-surface px-2 text-sm"
          />
        </div>
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
        {(params.objectType || params.objectId || params.action) && (
          <Link href="/administracao/auditoria" className="text-xs text-primary hover:underline">
            Limpar filtros
          </Link>
        )}
      </form>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="px-4 py-2.5">Quando</th>
              <th className="px-4 py-2.5">Ator</th>
              <th className="px-4 py-2.5">Ação</th>
              <th className="px-4 py-2.5">Objeto</th>
              <th className="px-4 py-2.5">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((event) => (
              <tr key={event.id} className="border-b border-border align-top last:border-0">
                <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                  {dateFormatter.format(event.createdAt)}
                </td>
                <td className="px-4 py-2.5">{event.actorLabel ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <Badge variant={event.action === "DELETE" ? "destructive" : "secondary"}>
                    {event.action}
                  </Badge>
                </td>
                <td className="px-4 py-2.5">
                  <div className="font-medium">{event.objectType}</div>
                  {event.objectId && (
                    <Link
                      href={`/administracao/auditoria${buildQuery({ ...params, objectId: event.objectId, page: undefined }, 1)}`}
                      className="font-mono text-xs text-primary hover:underline"
                      title="Histórico deste objeto"
                    >
                      {event.objectId.slice(0, 8)}… →
                    </Link>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <details>
                    <summary className="cursor-pointer text-xs text-primary">
                      ver payload
                    </summary>
                    <pre className="mt-1 max-w-md overflow-x-auto whitespace-pre-wrap rounded bg-muted p-2 text-[11px]">
                      {JSON.stringify(
                        { old: event.oldValue, new: event.newValue },
                        null,
                        1
                      )}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
            {result.items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum evento corresponde aos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Página {result.page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <Link
              href={`/administracao/auditoria${buildQuery(params, page - 1)}`}
              className={`inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-xs font-medium ${page <= 1 ? "pointer-events-none opacity-50" : "hover:bg-surface-hover"}`}
            >
              ← Anterior
            </Link>
            <Link
              href={`/administracao/auditoria${buildQuery(params, page + 1)}`}
              className={`inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-xs font-medium ${page >= totalPages ? "pointer-events-none opacity-50" : "hover:bg-surface-hover"}`}
            >
              Próxima →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
