import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTenantContext } from "@/core/tenant";
import { listUserOrganizations } from "@/modules/identity/services";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { OnboardingGuide } from "@/components/onboarding/onboarding-guide";

// Shell autenticado (§71): sidebar + topbar + conteúdo.
// Sem sessão ⇒ /entrar. Sessão sem tenant ativo ⇒ /selecionar-organizacao.

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/entrar");

  const context = await getTenantContext();
  if (!context) redirect("/selecionar-organizacao");

  const organizations = await listUserOrganizations(context.userId);
  const user = await prisma.user.findUnique({
    where: { id: context.userId },
    select: { onboardingGuideDismissedAt: true },
  });

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar permissions={[...context.permissions]} />
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
      <OnboardingGuide
        userId={context.userId}
        userName={context.userName}
        initiallyDismissed={Boolean(user?.onboardingGuideDismissedAt)}
      />
    </div>
  );
}
