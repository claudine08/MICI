import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { listRequirements } from "@/modules/requirements/selectors";
import { listProjects } from "@/modules/portfolio/selectors";
import { Badge } from "@/components/ui/badge";
import { NoPermission } from "@/components/shell/no-permission";
import { REQUIREMENT_STATUS_LABELS, type RequirementStatusValue } from "@/modules/requirements/engine";

export const metadata = { title: "Requisitos" };

// Visão única de requisitos da organização (E04): filtros por projeto/status.

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "destructive"> = {
  DRAFT: "secondary",
  ACTIVE: "default",
  COMPLETED: "success",
  CANCELLED: "destructive",
};

export default async function RequisitosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; project?: string }>;
}) {
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "REQUIREMENT", "VIEW")) {
    return <NoPermission required="REQUIREMENT:VIEW" />;
  }

  const params = await searchParams;
  const [requirements, projects] = await Promise.all([
    listRequirements(context.organizationId, {
      search: params.q,
      status: params.status,
      projectId: params.project,
    }),
    listProjects(context.organizationId),
  ]);
  const projectName = new Map(projects.map((project) => [project.id, project.name]));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Requisitos</h1>
        <p className="text-sm text-muted-foreground">
          DRP da organização (§20) — requisitos vivos de todos os projetos com vínculo de WBS e
          evidências.
        </p>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <label htmlFor="q" className="text-xs text-muted-foreground">
            Busca
          </label>
          <input
            id="q"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Código ou descrição"
            className="h-9 w-56 rounded-md border border-border bg-surface px-3 text-sm"
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor="status" className="text-xs text-muted-foreground">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={params.status ?? ""}
            className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
          >
            <option value="">Todos</option>
            {Object.entries(REQUIREMENT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label htmlFor="project" className="text-xs text-muted-foreground">
            Projeto
          </label>
          <select
            id="project"
            name="project"
            defaultValue={params.project ?? ""}
            className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
          >
            <option value="">Todos</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.code} — {project.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Filtrar
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="px-4 py-2.5">Código</th>
              <th className="px-4 py-2.5">Descrição</th>
              <th className="px-4 py-2.5">Projeto</th>
              <th className="px-4 py-2.5">WBS</th>
              <th className="px-4 py-2.5">Responsável</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Evid.</th>
            </tr>
          </thead>
          <tbody>
            {requirements.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5 font-mono text-xs">
                  <a
                    className="underline-offset-2 hover:underline"
                    href={`/projetos/${row.projectId}`}
                  >
                    {row.code}
                  </a>
                </td>
                <td className="max-w-md px-4 py-2.5">{row.description}</td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {projectName.get(row.projectId) ?? row.projectId}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                  {row.wbsNodeCode ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{row.ownerName ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <Badge variant={STATUS_VARIANT[row.status] ?? "secondary"}>
                    {REQUIREMENT_STATUS_LABELS[row.status as RequirementStatusValue] ?? row.status}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{row.evidenceCount}</td>
              </tr>
            ))}
            {requirements.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum requisito encontrado com os filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
