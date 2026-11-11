import { getTenantContext } from "@/core/tenant";
import { can, toPermissionSet } from "@/core/rbac";
import { getProjectDetail } from "@/modules/portfolio/selectors";
import { listSupplierRfis } from "@/modules/supplier-rfi/selectors";
import { listSuppliers } from "@/modules/procurement/selectors";
import { SupplierRfiView } from "@/components/supplier-rfi/supplier-rfi-view";
import { NoPermission } from "@/components/shell/no-permission";

export const metadata = { title: "RFI de Fornecedores" };

export default async function ProjetoSupplierRfiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = (await getTenantContext())!;
  const permissions = toPermissionSet(context.permissions);
  if (!can(permissions, "PROCUREMENT", "VIEW")) return <NoPermission required="PROCUREMENT:VIEW" />;
  const project = await getProjectDetail(context.organizationId, id);
  const [rfis, suppliers] = await Promise.all([
    listSupplierRfis(context.organizationId, id),
    listSuppliers(context.organizationId),
  ]);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">RFI de Fornecedores — {project.code} {project.name}</h1>
        <p className="text-sm text-muted-foreground">Consulta de preços a fornecedores (sem vínculo formal de compra).</p>
      </div>
      <SupplierRfiView projectId={id} rfis={rfis} suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))} canCreate={can(permissions, "PROCUREMENT", "CREATE")} canEdit={can(permissions, "PROCUREMENT", "EDIT")} />
    </div>
  );
}