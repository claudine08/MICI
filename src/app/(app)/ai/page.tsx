import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { AI_PROMPTS } from "@/modules/ai/prompts";
import { listAiRequests } from "@/modules/ai/selectors";
import { AiView } from "@/components/ai/ai-view";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "Inteligência Artificial" };

export default async function AiPage() {
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);
  if (!can(permissions, "AI", "VIEW")) return <NoPermission required="AI:VIEW" />;
  const requests = await listAiRequests(context.organizationId, null, 30);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Inteligência Artificial (E18)</h1>
        <p className="text-sm text-muted-foreground">Gateway de IA, prompts e histórico de requisições.</p>
      </div>
      <AiView prompts={AI_PROMPTS} initialRequests={requests} canCreate={can(permissions, "AI", "CREATE")} />
    </div>
  );
}