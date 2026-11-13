import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { getProjectDetail, listClients, listTemplates } from "@/modules/portfolio/selectors";
import { listProjectGateInstances } from "@/modules/gates/instances";
import { listMembers } from "@/modules/identity/selectors";
import { ProjectDetailView } from "@/components/portfolio/project-detail-view";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "Projeto" };

export default async function ProjetoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "PROJECT", "VIEW")) {
    return <NoPermission required="PROJECT:VIEW" />;
  }

  let project;
  try {
    project = await getProjectDetail(context.organizationId, id);
  } catch {
    redirect("/projetos");
  }
  const [gates, clients, templates, members] = await Promise.all([
    listProjectGateInstances(context.organizationId, id, context.userId),
    listClients(context.organizationId),
    listTemplates(context.organizationId),
    listMembers(context.organizationId),
  ]);

  const openChatRfis = await prisma.rfi.findMany({
    where: {
      projectId: id,
      organizationId: context.organizationId,
      deletedAt: null,
      recipientId: context.userId,
      status: { notIn: ["CLOSED", "CANCELLED"] },
    },
    select: { code: true, title: true, subjectGroup: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const openChatCount = openChatRfis.length;
  const openChatTooltip =
    openChatRfis.length > 0
      ? `Mensagens abertas para você:\n${openChatRfis.map((r) => `${r.code} — ${r.title}${r.subjectGroup ? ` (${r.subjectGroup})` : ""}`).join("\n")}`
      : undefined;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Projeto</h1>
        <p className="text-sm text-muted-foreground">
          Fase e status são distintos (§14.2); o avanço de fase obedece ao BR-001.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          <a className="rounded-md border border-border bg-surface px-2 py-1.5 text-center font-medium transition-colors hover:border-primary/50 hover:bg-surface-hover" href={`/projetos/${id}/requisitos`}>
            Requisitos e DRP
          </a>
          <a className="rounded-md border border-border bg-surface px-2 py-1.5 text-center font-medium transition-colors hover:border-primary/50 hover:bg-surface-hover" href={`/projetos/${id}/wbs`}>
            WBS
          </a>
          <a className="rounded-md border border-border bg-surface px-2 py-1.5 text-center font-medium transition-colors hover:border-primary/50 hover:bg-surface-hover" href={`/projetos/${id}/cronograma`}>
            Cronograma
          </a>
          <a className="rounded-md border border-border bg-surface px-2 py-1.5 text-center font-medium transition-colors hover:border-primary/50 hover:bg-surface-hover" href={`/projetos/${id}/custos`}>
            Custos
          </a>
          <a className="rounded-md border border-border bg-surface px-2 py-1.5 text-center font-medium transition-colors hover:border-primary/50 hover:bg-surface-hover" href={`/projetos/${id}/dashboard`}>
            Dashboard
          </a>
          <a className="rounded-md border border-border bg-surface px-2 py-1.5 text-center font-medium transition-colors hover:border-primary/50 hover:bg-surface-hover" href={`/projetos/${id}/documentos`}>
            Documentos
          </a>
          <a className="rounded-md border border-border bg-surface px-2 py-1.5 text-center font-medium transition-colors hover:border-primary/50 hover:bg-surface-hover" href={`/projetos/${id}/riscos`}>
            Riscos
          </a>
          <a className="rounded-md border border-border bg-surface px-2 py-1.5 text-center font-medium transition-colors hover:border-primary/50 hover:bg-surface-hover" href={`/projetos/${id}/mudancas`}>
            Mudanças
          </a>
          <a className="rounded-md border border-border bg-surface px-2 py-1.5 text-center font-medium transition-colors hover:border-primary/50 hover:bg-surface-hover" href={`/projetos/${id}/qualidade`}>
            Qualidade
          </a>
          <a className="rounded-md border border-border bg-surface px-2 py-1.5 text-center font-medium transition-colors hover:border-primary/50 hover:bg-surface-hover" href={`/projetos/${id}/suprimentos`}>
            Suprimentos
          </a>
          <a className="rounded-md border border-border bg-surface px-2 py-1.5 text-center font-medium transition-colors hover:border-primary/50 hover:bg-surface-hover" href={`/projetos/${id}/commissioning`}>
            Comissionamento
          </a>
          <a className="rounded-md border border-border bg-surface px-2 py-1.5 text-center font-medium transition-colors hover:border-primary/50 hover:bg-surface-hover" href={`/projetos/${id}/sustentabilidade`}>
            Sustentabilidade
          </a>
          <a className="rounded-md border border-border bg-surface px-2 py-1.5 text-center font-medium transition-colors hover:border-primary/50 hover:bg-surface-hover" href={`/projetos/${id}/reunioes`}>
            Reuniões
          </a>
          <a
            title={openChatTooltip}
            className={`rounded-md border border-border bg-surface px-2 py-1.5 text-center font-medium transition-colors hover:border-primary/50 hover:bg-surface-hover ${openChatCount > 0 ? "border-red-300 bg-red-50 text-red-600 animate-pulse" : ""}`}
            href={`/projetos/${id}/chat`}
          >
            Chat{openChatCount > 0 ? ` (${openChatCount})` : ""}
          </a>
          <a className="rounded-md border border-border bg-surface px-2 py-1.5 text-center font-medium transition-colors hover:border-primary/50 hover:bg-surface-hover" href={`/projetos/${id}/supplier-rfi`}>
            RFI Fornecedores
          </a>
        </div>
      </div>
      <ProjectDetailView
        project={project}
        gates={gates}
        clients={clients.map((client) => ({ id: client.id, name: client.name }))}
        templates={templates.map((template) => ({ id: template.id, name: template.name }))}
        members={members.map((member) => ({ id: member.userId, name: member.name }))}
        canEdit={can(permissions, "PROJECT", "EDIT")}
        canManageGates={can(permissions, "GATE", "EDIT")}
        canApproveGates={can(permissions, "GATE", "APPROVE")}
        canRejectGates={can(permissions, "GATE", "REJECT")}
      />
    </div>
  );
}
