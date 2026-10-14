import { can, toPermissionSet } from "@/core/rbac";
import { getTenantContext } from "@/core/tenant";
import { NoPermission } from "@/components/shell/no-permission";
import { OrcamentoView } from "@/components/orcamento/orcamento-view";

export const metadata = { title: "Orçamento de cozinha" };

// Calculadora de orçamento preliminar de implantação de cozinha industrial
// (entrada da fase de orçamentação — E08). Sem persistência: exporta JSON/CSV.

export default async function OrcamentoPage() {
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);

  if (!can(permissions, "COST", "VIEW")) {
    return <NoPermission required="COST:VIEW" />;
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Orçamento de cozinha industrial</h1>
        <p className="text-sm text-muted-foreground">
          Cálculo preliminar de implantação (premissas → dimensionamento → quantitativos →
          custos), com exportação JSON/CSV para a fase de orçamentação. Método: memória de
          cálculo MICI (RDC Anvisa 216/2004, ABNT NBR 14518, SINAPI).
        </p>
      </div>
      <OrcamentoView />
    </div>
  );
}
