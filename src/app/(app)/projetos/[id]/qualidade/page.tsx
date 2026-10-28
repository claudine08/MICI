import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { getProjectDetail } from "@/modules/portfolio/selectors";
import {
  listChecklistExecutions,
  listChecklistTemplates,
  listCorrectiveActions,
  listInspections,
  listNonConformities,
} from "@/modules/quality/selectors";
import { summarizeQualityBoard } from "@/modules/quality/engine";
import { listMembers } from "@/modules/identity/selectors";
import { getWbsTree } from "@/modules/wbs/selectors";
import { flattenWbsTree } from "@/modules/wbs/engine";
import { listActivities } from "@/modules/schedule/selectors";
import { QualityView } from "@/components/quality/quality-view";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "Qualidade do projeto" };

// Operação de qualidade do projeto (E13-US01..US04, §33): modelos de
// checklist, execuções com resposta de itens, inspeções com critério, NCR e
// ações corretivas.
export default async function ProjetoQualidadePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "QUALITY", "VIEW")) {
    return <NoPermission required="QUALITY:VIEW" />;
  }

  const project = await getProjectDetail(context.organizationId, id);

  const [templates, executions, inspections, nonConformities, correctiveActions, members, tree, activityRows] =
    await Promise.all([
      listChecklistTemplates(context.organizationId, id),
      listChecklistExecutions(context.organizationId, id),
      listInspections(context.organizationId, id),
      listNonConformities(context.organizationId, id),
      listCorrectiveActions(context.organizationId, id),
      listMembers(context.organizationId),
      getWbsTree(context.organizationId, id),
      listActivities(context.organizationId, id),
    ]);

  const wbsNodes = flattenWbsTree(tree).map((node) => ({
    id: node.id,
    label: `${node.path} → ${node.name}`,
  }));
  const activities = activityRows.map((activity) => ({
    id: activity.id,
    label: `${activity.code} → ${activity.name}`,
  }));

  const activeMembers = members
    .filter((member) => member.membershipStatus === "ACTIVE" && member.userStatus === "ACTIVE")
    .map((member) => ({ id: member.userId, label: member.name }));

  const board = summarizeQualityBoard({
    templates: templates.map((template) => ({ id: template.id })),
    executions: executions.map((execution) => ({ status: execution.status })),
    inspections: inspections.map((inspection) => ({ status: inspection.status })),
    nonConformities: nonConformities.map((ncr) => ({ status: ncr.status })),
    correctiveActions: correctiveActions.map((action) => ({ status: action.status })),
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Qualidade — {project.code} {project.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Checklists, inspeções com critério de aceite, NCR e ações corretivas
          (E13-US01..US04, §33).
        </p>
      </div>
      <QualityView
        projectId={id}
        initialTemplates={templates}
        initialExecutions={executions}
        initialInspections={inspections}
        initialNonConformities={nonConformities}
        initialCorrectiveActions={correctiveActions}
        board={board}
        members={activeMembers}
        wbsNodes={wbsNodes}
        activities={activities}
        canCreate={can(permissions, "QUALITY", "CREATE")}
        canEdit={can(permissions, "QUALITY", "EDIT")}
        canDelete={can(permissions, "QUALITY", "DELETE")}
      />
    </div>
  );
}
