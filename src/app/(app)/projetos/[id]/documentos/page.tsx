import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { getProjectDetail } from "@/modules/portfolio/selectors";
import { listDocuments } from "@/modules/documents/selectors";
import { listRequirements } from "@/modules/requirements/selectors";
import { listAllWbsNodes } from "@/modules/wbs/selectors";
import { listActivities } from "@/modules/schedule/selectors";
import { listCostItems } from "@/modules/cost/selectors";
import { DocumentView } from "@/components/documents/document-view";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "Documentos do projeto" };

export default async function ProjetoDocumentosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "DOCUMENT", "VIEW")) {
    return <NoPermission required="DOCUMENT:VIEW" />;
  }

  const project = await getProjectDetail(context.organizationId, id);

  const [documents, requirements, wbsNodes, activities, costItems] = await Promise.all([
    listDocuments(context.organizationId, id),
    listRequirements(context.organizationId, { projectId: id }),
    listAllWbsNodes(context.organizationId, id),
    listActivities(context.organizationId, id),
    listCostItems(context.organizationId, id),
  ]);

  const linkTargets = {
    requirements: requirements.map((row) => ({
      id: row.id,
      label: `${row.code} — ${row.description.slice(0, 80)}`,
    })),
    wbsNodes: wbsNodes.map((row) => ({ id: row.id, label: `${row.code} — ${row.name}` })),
    activities: activities.map((row) => ({ id: row.id, label: `${row.code} — ${row.name}` })),
    costItems: costItems.map((row) => ({ id: row.id, label: `${row.code} — ${row.description}` })),
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Documentos — {project.code} {project.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Upload com hash SHA-256, revisões imutáveis (BR-009), aprovação, liberação e
          links com outros objetos — E09-US01…US05, §36.
        </p>
      </div>
      <DocumentView
        projectId={id}
        initialDocuments={documents}
        linkTargets={linkTargets}
        canCreate={can(permissions, "DOCUMENT", "CREATE")}
        canEdit={can(permissions, "DOCUMENT", "EDIT")}
        canDelete={can(permissions, "DOCUMENT", "DELETE")}
        canApprove={can(permissions, "DOCUMENT", "APPROVE")}
      />
    </div>
  );
}
