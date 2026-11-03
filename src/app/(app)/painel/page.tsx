import { getTenantContext } from "@/core/tenant";
import { getPortfolioDashboard } from "@/modules/dashboard/portfolio";
import { PainelView } from "@/components/dashboard/painel-view";

export default async function PainelPage({ searchParams }: { searchParams: Promise<{ asOf?: string }> }) {
  const context = (await getTenantContext())!;
  const sp = await searchParams;
  const asOf = sp.asOf && /^\d{4}-\d{2}-\d{2}$/.test(sp.asOf) ? sp.asOf : new Date().toISOString().slice(0, 10);
  const data = await getPortfolioDashboard(context.organizationId, asOf);
  return <PainelView kpis={data.kpis} projects={data.projects} asOf={asOf} />;
}