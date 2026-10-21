import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { getProjectDetail } from "@/modules/portfolio/selectors";
import { listChanges } from "@/modules/change/selectors";
import { listMembers } from "@/modules/identity/selectors";
import { listBaselines } from "@/modules/schedule/baselines";
import { ChangeView } from "@/components/change/change-view";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "Mudanças do projeto" };

export default async function ProjetoMudancasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "CHANGE", "VIEW")) {
    return <NoPermission required="CHANGE:VIEW" />;
  }

  const project = await getProjectDetail(context.organizationId, id);

  const [changes, members, baselines] = await Promise.all([
    listChanges(context.organizationId, id),
    listMembers(context.organizationId),
    listBaselines(context.organizationId, id),
  ]);

  const activeMembers = members
    .filter((member) => member.membershipStatus === "ACTIVE" && member.userStatus === "ACTIVE")
    .map((member) => ({ userId: member.userId, name: member.name }));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Mudanças — {project.code} {project.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Controle de mudanças com workflow, análise de impacto por dimensão, aprovação
          auditada e baseline revision (E11, §31 — BR-004/BR-005).
        </p>
      </div>
      <ChangeView
        projectId={id}
        initialChanges={changes}
        members={activeMembers}
        baselines={baselines.map((baseline) => ({
          id: baseline.id,
          label: `${baseline.type} v${baseline.version} — ${baseline.status}`,
        }))}
        canCreate={can(permissions, "CHANGE", "CREATE")}
        canEdit={can(permissions, "CHANGE", "EDIT")}
        canDelete={can(permissions, "CHANGE", "DELETE")}
        canApprove={can(permissions, "CHANGE", "APPROVE")}
        canReject={can(permissions, "CHANGE", "REJECT")}
      />
    </div>
  );
}
