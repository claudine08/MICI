import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { getProjectDetail } from "@/modules/portfolio/selectors";
import { getWbsTree } from "@/modules/wbs/selectors";
import { flattenWbsTree } from "@/modules/wbs/engine";
import { listActivities } from "@/modules/schedule/selectors";
import { listCostItems } from "@/modules/cost/selectors";
import { listRisks, getEffectiveRiskMatrix } from "@/modules/risk/selectors";
import { listMembers } from "@/modules/identity/selectors";
import { RiskView } from "@/components/risk/risk-view";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "Riscos do projeto" };

export default async function ProjetoRiscosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "RISK", "VIEW")) {
    return <NoPermission required="RISK:VIEW" />;
  }

  const project = await getProjectDetail(context.organizationId, id);
  const tree = await getWbsTree(context.organizationId, id);
  const wbsNodes = flattenWbsTree(tree).map((node) => ({
    id: node.id,
    label: `${node.path} — ${node.name}`,
  }));

  const [risks, matrix, members, activities, costItems] = await Promise.all([
    listRisks(context.organizationId, id),
    getEffectiveRiskMatrix(context.organizationId),
    listMembers(context.organizationId),
    listActivities(context.organizationId, id),
    listCostItems(context.organizationId, id),
  ]);

  const activeMembers = members
    .filter((member) => member.membershipStatus === "ACTIVE" && member.userStatus === "ACTIVE")
    .map((member) => ({ userId: member.userId, name: member.name }));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Riscos — {project.code} {project.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Registro de riscos, matriz probabilidade × impacto, respostas e risco
          residual (E10-US01…US04, §32).
        </p>
      </div>
      <RiskView
        projectId={id}
        initialRisks={risks}
        matrix={matrix}
        members={activeMembers}
        wbsNodes={wbsNodes}
        activities={activities.map((activity) => ({
          id: activity.id,
          label: `${activity.code} — ${activity.name}`,
        }))}
        costItems={costItems.map((item) => ({
          id: item.id,
          label: `${item.code} — ${item.description}`,
        }))}
        canCreate={can(permissions, "RISK", "CREATE")}
        canEdit={can(permissions, "RISK", "EDIT")}
        canDelete={can(permissions, "RISK", "DELETE")}
      />
    </div>
  );
}
