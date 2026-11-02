import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { getProjectDetail } from "@/modules/portfolio/selectors";
import {
  listCommissioningPlans,
  listCommissioningItems,
  listAcceptances,
} from "@/modules/commissioning/selectors";
import { listMembers } from "@/modules/identity/selectors";
import { getWbsTree } from "@/modules/wbs/selectors";
import { flattenWbsTree } from "@/modules/wbs/engine";
import { listActivities } from "@/modules/schedule/selectors";

import { CommissioningView } from "@/components/commissioning/commissioning-view";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "Comissionamento do projeto" };

export default async function ProjetoCommissioningPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "COMMISSIONING", "VIEW")) {
    return <NoPermission required="COMMISSIONING:VIEW" />;
  }

  const project = await getProjectDetail(context.organizationId, id);

  const [plans, items, acceptances, members, tree, activityRows] = await Promise.all([
    listCommissioningPlans(context.organizationId, id),
    listCommissioningItems(context.organizationId, id),
    listAcceptances(context.organizationId, id),
    listMembers(context.organizationId),
    getWbsTree(context.organizationId, id),
    listActivities(context.organizationId, id),
  ]);

  const wbsNodes = flattenWbsTree(tree).map((node) => ({ id: node.id, label: `${node.path} → ${node.name}` }));
  const activities = activityRows.map((activity) => ({ id: activity.id, label: `${activity.code} → ${activity.name}` }));
  const activeMembers = members
    .filter((m) => m.membershipStatus === "ACTIVE" && m.userStatus === "ACTIVE")
    .map((m) => ({ id: m.userId, label: m.name }));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Comissionamento — {project.code} {project.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Planos de comissionamento, testes/retestes e aceite formal (E15).
        </p>
      </div>
      <CommissioningView
        projectId={id}
        initialPlans={plans}
        initialItems={items}
        initialAcceptances={acceptances}
        members={activeMembers}
        wbsNodes={wbsNodes}
        activities={activities}

        canCreate={can(permissions, "COMMISSIONING", "CREATE")}
        canEdit={can(permissions, "COMMISSIONING", "EDIT")}
        canDelete={can(permissions, "COMMISSIONING", "DELETE")}
      />
    </div>
  );
}