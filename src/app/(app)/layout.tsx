import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTenantContext } from "@/core/tenant";
import { listUserOrganizations } from "@/modules/identity/services";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

// Shell autenticado (§71): sidebar + topbar + conteúdo.
// Sem sessão ⇒ /entrar. Sessão sem tenant ativo ⇒ /selecionar-organizacao.

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/entrar");

  const context = await getTenantContext();
  if (!context) redirect("/selecionar-organizacao");

  const organizations = await listUserOrganizations(context.userId);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          userName={context.userName}
          userEmail={context.userEmail}
          roleCodes={context.roleCodes}
          organizations={organizations}
          activeOrganizationId={context.organizationId}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
