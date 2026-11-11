import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { getProjectDetail } from "@/modules/portfolio/selectors";
import { listRfis } from "@/modules/rfi/selectors";
import { listMembers } from "@/modules/identity/selectors";
import { RfiView } from "@/components/rfi/rfi-view";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "RFI do projeto" };

export default async function ProjetoRfiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);
  if (!can(permissions, "PROJECT", "VIEW")) return <NoPermission required="PROJECT:VIEW" />;
  const project = await getProjectDetail(context.organizationId, id);
  const [rfis, members] = await Promise.all([
    listRfis(context.organizationId, id),
    listMembers(context.organizationId),
  ]);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">RFI — {project.code} {project.name}</h1>
        <p className="text-sm text-muted-foreground">Request for Information (Onda 4, Release 2).</p>
      </div>
      <RfiView projectId={id} rfis={rfis} members={members.map((m) => ({ id: m.userId, name: m.name }))} canCreate={can(permissions, "PROJECT", "CREATE")} canEdit={can(permissions, "PROJECT", "EDIT")} canDelete={can(permissions, "PROJECT", "DELETE")} currentUserId={context.userId} />
    </div>
  );
}