import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { getProjectDetail } from "@/modules/portfolio/selectors";
import { listMeetings } from "@/modules/meetings/selectors";
import { listMembers } from "@/modules/identity/selectors";
import { MeetingsView } from "@/components/meetings/meetings-view";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "Reuniões do projeto" };

export default async function ProjetoReunioesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);
  if (!can(permissions, "PROJECT", "VIEW")) return <NoPermission required="PROJECT:VIEW" />;
  const project = await getProjectDetail(context.organizationId, id);
  const [meetings, members] = await Promise.all([
    listMeetings(context.organizationId, id),
    listMembers(context.organizationId),
  ]);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Reuniões — {project.code} {project.name}</h1>
        <p className="text-sm text-muted-foreground">Atas de reunião com decisões e ações (Onda 4, §20).</p>
      </div>
      <MeetingsView
        projectId={id}
        meetings={meetings}
        members={members.map((m) => ({ id: m.userId, name: m.name }))}
        canCreate={can(permissions, "PROJECT", "CREATE")}
        canEdit={can(permissions, "PROJECT", "EDIT")}
        canDelete={can(permissions, "PROJECT", "DELETE")}
      />
    </div>
  );
}