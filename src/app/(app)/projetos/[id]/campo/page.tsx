import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { getProjectDetail } from "@/modules/portfolio/selectors";
import {
  listDiaries,
  listTasks,
  listConstraints,
  listPhotos,
  listProgress,
} from "@/modules/field/selectors";
import { summarizeFieldBoard } from "@/modules/field/engine";
import { listInspections } from "@/modules/quality/selectors";
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

  const [diaries, tasks, constraints, photos, progress, members, tree, activityRows, inspectionRows] =
    await Promise.all([
      listDiaries(context.organizationId, id),
      listTasks(context.organizationId, id),
      listConstraints(context.organizationId, id),
      listPhotos(context.organizationId, id),
      listProgress(context.organizationId, id),
      listMembers(context.organizationId),
      getWbsTree(context.organizationId, id),
      listActivities(context.organizationId, id),
      listInspections(context.organizationId, id),
    ]);

  const wbsNodes = flattenWbsTree(tree).map((node) => ({
    id: node.id,
    label: `${node.path} — ${node.name}`,
  }));
  const activities = activityRows.map((activity) => ({
    id: activity.id,
    label: `${activity.code} — ${activity.name}`,
  }));
  // Evidência de inspeção (E13-US02, §33): o upload de foto pode apontar para
  // qualquer inspeção do projeto — é o que sustenta PASS/FAIL. Todas ficam na
  // lista para editar vínculos já gravados (inclusive de inspeção encerrada).
  const inspections = inspectionRows.map((inspection) => ({
    id: inspection.id,
    label: `${inspection.code} — ${inspection.title}`,
  }));

  const activeMembers = members
    .filter((member) => member.membershipStatus === "ACTIVE" && member.userStatus === "ACTIVE")
    .map((member) => ({ id: member.userId, label: member.name }));

  const today = new Date().toISOString().slice(0, 10);
  const weekEndDate = new Date();
  weekEndDate.setDate(weekEndDate.getDate() + (7 - weekEndDate.getDay()));

  const activeActivities = activityRows.filter(
    (activity) => activity.status !== "CANCELLED"
  );
  const physicalAverage =
    activeActivities.length === 0
      ? 0
      : Math.round(
          activeActivities.reduce((sum, activity) => sum + activity.physicalProgress, 0) /
            activeActivities.length
        );

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
          Diários, tarefas, restrições, fotos e medição de avanço físico (E12, §38).
        </p>
      </div>
      <FieldView
        projectId={id}
        initialDiaries={diaries}
        initialTasks={tasks}
        initialConstraints={constraints}
        initialPhotos={photos}
        initialProgress={progress}
        board={board}
        physicalAverage={physicalAverage}
        members={activeMembers}
        wbsNodes={wbsNodes}
        activities={activities}
        inspections={inspections}
        canCreate={can(permissions, "FIELD", "CREATE")}
        canEdit={can(permissions, "FIELD", "EDIT")}
        canDelete={can(permissions, "FIELD", "DELETE")}
        canApprove={can(permissions, "FIELD", "APPROVE")}
        canReject={can(permissions, "FIELD", "REJECT")}
      />
    </div>
  );
}
