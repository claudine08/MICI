import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { getProjectDetail } from "@/modules/portfolio/selectors";
import { getSchedule } from "@/modules/schedule/selectors";
import { listBaselines } from "@/modules/schedule/baselines";
import { listCalendars } from "@/modules/schedule/calendars";
import { listScheduleTemplates } from "@/modules/schedule/templates";
import { getWbsTree } from "@/modules/wbs/selectors";
import { flattenWbsTree } from "@/modules/wbs/engine";
import { ScheduleView } from "@/components/schedule/schedule-view";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "Cronograma do projeto" };

export default async function ProjetoCronogramaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "SCHEDULE", "VIEW")) {
    return <NoPermission required="SCHEDULE:VIEW" />;
  }

  const project = await getProjectDetail(context.organizationId, id);
  const [schedule, tree, baselines, calendars, scheduleTemplates] = await Promise.all([
    getSchedule(context.organizationId, id),
    getWbsTree(context.organizationId, id),
    listBaselines(context.organizationId, id),
    listCalendars(context.organizationId, id),
    listScheduleTemplates(context.organizationId),
  ]);
  const wbsNodes = flattenWbsTree(tree).map((node) => ({
    id: node.id,
    code: node.path,
    name: node.name,
  }));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Cronograma — {project.code} {project.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Atividades, dependências FS/SS/FF/SF, caminho crítico, calendários, baseline e
          forecast (E07-US01…US06, §27–28) — float e crítico são recalculados, nunca
          assumidos.
        </p>
      </div>
      <ScheduleView
        projectId={id}
        activities={schedule.activities}
        dependencies={schedule.dependencies}
        baselines={baselines}
        calendars={calendars}
        wbsNodes={wbsNodes}
        scheduleTemplates={scheduleTemplates}
        canCreate={can(permissions, "SCHEDULE", "CREATE")}
        canEdit={can(permissions, "SCHEDULE", "EDIT")}
        canDelete={can(permissions, "SCHEDULE", "DELETE")}
        canApprove={can(permissions, "SCHEDULE", "APPROVE")}
      />
    </div>
  );
}
