import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { getProjectDetail } from "@/modules/portfolio/selectors";
import { listDiaries, listTasks, listConstraints, listPhotos } from "@/modules/field/selectors";
import { summarizeFieldBoard } from "@/modules/field/engine";
import { listMembers } from "@/modules/identity/selectors";
import { getWbsTree } from "@/modules/wbs/selectors";
import { flattenWbsTree } from "@/modules/wbs/engine";
import { listActivities } from "@/modules/schedule/selectors";
import { FieldView } from "@/components/field/field-view";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "Campo do projeto" };

// Operação de campo do projeto (E12-US01…US06, §38): mobile-first,
// poucos campos e home do dia.
export default async function ProjetoCampoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "FIELD", "VIEW")) {
    return <NoPermission required="FIELD:VIEW" />;
  }

  const project = await getProjectDetail(context.organizationId, id);

  const [diaries, tasks, constraints, photos, members, tree, activityRows] = await Promise.all([
    listDiaries(context.organizationId, id),
    listTasks(context.organizationId, id),
    listConstraints(context.organizationId, id),
    listPhotos(context.organizationId, id),
    listMembers(context.organizationId),
    getWbsTree(context.organizationId, id),
    listActivities(context.organizationId, id),
  ]);

  const wbsNodes = flattenWbsTree(tree).map((node) => ({
    id: node.id,
    label: `${node.path} — ${node.name}`,
  }));
  const activities = activityRows.map((activity) => ({
    id: activity.id,
    label: `${activity.code} — ${activity.name}`,
  }));

  const activeMembers = members
    .filter((member) => member.membershipStatus === "ACTIVE" && member.userStatus === "ACTIVE")
    .map((member) => ({ id: member.userId, label: member.name }));

  const today = new Date().toISOString().slice(0, 10);
  const weekEndDate = new Date();
  weekEndDate.setDate(weekEndDate.getDate() + (7 - weekEndDate.getDay()));

  const board = summarizeFieldBoard({
    diaryEntries: diaries.map((diary) => ({ entryDate: diary.entryDate })),
    tasks: tasks.map((task) => ({ status: task.status, dueDate: task.dueDate })),
    constraints: constraints.map((constraint) => ({ status: constraint.status })),
    today,
    weekEnd: weekEndDate.toISOString().slice(0, 10),
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Campo — {project.code} {project.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Diários de obra, tarefas, restrições e fotos de evidência (E12, §38).
        </p>
      </div>
      <FieldView
        projectId={id}
        initialDiaries={diaries}
        initialTasks={tasks}
        initialConstraints={constraints}
        initialPhotos={photos}
        board={board}
        members={activeMembers}
        wbsNodes={wbsNodes}
        activities={activities}
        canCreate={can(permissions, "FIELD", "CREATE")}
        canEdit={can(permissions, "FIELD", "EDIT")}
        canDelete={can(permissions, "FIELD", "DELETE")}
        canApprove={can(permissions, "FIELD", "APPROVE")}
        canReject={can(permissions, "FIELD", "REJECT")}
      />
    </div>
  );
}
