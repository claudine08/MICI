import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listUserOrganizations } from "@/modules/identity/services";
import { OrgSelectView } from "@/components/shell/org-select-view";

export const metadata = { title: "Selecionar organização" };

// Seleção de tenant ativo — rota fora do shell autenticado (não exige contexto).

export default async function SelecionarOrganizacaoPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/entrar");

  const organizations = await listUserOrganizations(session.user.id);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="mb-6 text-center">
        <div className="text-2xl font-bold tracking-tight text-primary">MICI</div>
      </div>
      <OrgSelectView
        organizations={organizations}
        userName={session.user.name ?? session.user.email ?? ""}
      />
    </main>
  );
}
