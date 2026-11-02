import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { getProjectDetail } from "@/modules/portfolio/selectors";
import {
  listSustainabilityPlans,
  listSustainabilityMetrics,
  listSustainabilityBaselines,
  listSustainabilityTargets,
  listSustainabilityMeasurements,
  listWasteRecords,
} from "@/modules/sustainability/selectors";
import { listMembers } from "@/modules/identity/selectors";
import { getWbsTree } from "@/modules/wbs/selectors";
import { flattenWbsTree } from "@/modules/wbs/engine";
import { listActivities } from "@/modules/schedule/selectors";
import { SustainabilityView } from "@/components/sustainability/sustainability-view";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "Sustentabilidade do projeto" };

export default async function ProjetoSustentabilidadePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);
  if (!can(permissions, "SUSTAINABILITY", "VIEW")) return <NoPermission required="SUSTAINABILITY:VIEW" />;
  const project = await getProjectDetail(context.organizationId, id);
  const [plans, metrics, baselines, targets, measurements, wastes, members, tree, activityRows] = await Promise.all([
    listSustainabilityPlans(context.organizationId, id),
    listSustainabilityMetrics(context.organizationId, id),
    listSustainabilityBaselines(context.organizationId, id),
    listSustainabilityTargets(context.organizationId, id),
    listSustainabilityMeasurements(context.organizationId, id),
    listWasteRecords(context.organizationId, id),
    listMembers(context.organizationId),
    getWbsTree(context.organizationId, id),
    listActivities(context.organizationId, id),
  ]);
  const wbsNodes = flattenWbsTree(tree).map((n) => ({ id: n.id, label: `${n.path} → ${n.name}` }));
  const activities = activityRows.map((a) => ({ id: a.id, label: `${a.code} → ${a.name}` }));
  const activeMembers = members.filter((m) => m.membershipStatus === "ACTIVE" && m.userStatus === "ACTIVE").map((m) => ({ id: m.userId, label: m.name }));
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Sustentabilidade — {project.code} {project.name}</h1>
        <p className="text-sm text-muted-foreground">PSP, métricas, baseline, metas, medições e resíduos (E16).</p>
      </div>
      <SustainabilityView
        projectId={id}
        initialPlans={plans}
        initialMetrics={metrics}
        initialBaselines={baselines}
        initialTargets={targets}
        initialMeasurements={measurements}
        initialWastes={wastes}
        members={activeMembers}
        wbsNodes={wbsNodes}
        activities={activities}
        canCreate={can(permissions, "SUSTAINABILITY", "CREATE")}
        canEdit={can(permissions, "SUSTAINABILITY", "EDIT")}
        canDelete={can(permissions, "SUSTAINABILITY", "DELETE")}
      />
    </div>
  );
}