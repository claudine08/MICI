import { getTenantContext } from "@/core/tenant";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Users, KeyRound, ShieldCheck, ScrollText, FolderKanban, Milestone } from "lucide-react";

const PROJECT_PHASES = [
  { code: "F0", name: "Oportunidade" },
  { code: "F1", name: "Descoberta e Requisitos" },
  { code: "F2", name: "Viabilidade e Concepção" },
  { code: "F3", name: "Orçamentação" },
  { code: "F4", name: "Contratação e Mobilização" },
  { code: "F5", name: "Projeto Executivo" },
  { code: "F6", name: "Suprimentos" },
  { code: "F7", name: "Execução" },
  { code: "F8", name: "Entrega" },
  { code: "F9", name: "Encerramento" },
  { code: "F10", name: "Pós-ocupação / Garantia" },
] as const;

const PROJECT_GATES = [
  { code: "G0", name: "Oportunidade qualificada" },
  { code: "G1", name: "Requisitos suficientes" },
  { code: "G2", name: "Viabilidade" },
  { code: "G3", name: "Proposta/orçamento" },
  { code: "G4", name: "Contrato e plano" },
  { code: "G5", name: "Projeto liberado" },
  { code: "G6", name: "Pronto para comissionamento" },
  { code: "G7", name: "Aceite operacional" },
  { code: "G8", name: "Encerramento" },
] as const;

export default async function PainelPage() {
  const context = (await getTenantContext())!;
  const [memberCount, roleCount, auditCount, projectCount, recentProjects, pendingGates] =
    await Promise.all([
      prisma.organizationMembership.count({
        where: { organizationId: context.organizationId, status: "ACTIVE", deletedAt: null },
      }),
      prisma.role.count({ where: { organizationId: context.organizationId, deletedAt: null } }),
      prisma.auditEvent.count({
        where: { organizationId: context.organizationId },
      }),
      prisma.project.count({
        where: { organizationId: context.organizationId, deletedAt: null },
      }),
      prisma.project.findMany({
        where: { organizationId: context.organizationId, deletedAt: null },
        select: { id: true, code: true, name: true, currentPhase: true, status: true },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      prisma.gateInstance.count({
        where: {
          organizationId: context.organizationId,
          status: { in: ["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "UNDER_REVIEW", "REJECTED"] },
          project: { deletedAt: null },
        },
      }),
    ]);

  const stats = [
    { label: "Membros", value: memberCount, icon: Users },
    { label: "Papéis", value: roleCount, icon: KeyRound },
    { label: "Projetos", value: projectCount, icon: FolderKanban },
    { label: "Gates pendentes", value: pendingGates, icon: Milestone },
    { label: "Permissões suas", value: context.permissions.size, icon: ShieldCheck },
    { label: "Eventos de auditoria", value: auditCount, icon: ScrollText },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Olá, {context.userName.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">
          Organização <span className="font-medium text-foreground">{context.organizationName}</span>{" "}
          · {context.roleCodes.join(", ")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <stat.icon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-lg font-semibold leading-none">{stat.value}</div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
          <CardHeader>
            <CardTitle>
              {recentProjects.length > 0 ? "Projetos recentes" : "Nenhum projeto ainda"}
            </CardTitle>
            <CardDescription>
              {recentProjects.length > 0
                ? "Últimos projetos do portfólio — abra para ver fases e gates."
                : "Crie o primeiro projeto em Portfólio → Projetos. Gates oficiais G0–G8 já "
                  + "estão configurados para a organização."}
            </CardDescription>
          </CardHeader>
          {recentProjects.length > 0 && (
            <CardContent className="flex flex-col gap-2">
              {recentProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projetos/${project.id}`}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-hover"
                >
                  <span>
                    <span className="font-mono text-xs text-muted-foreground">{project.code}</span>{" "}
                    <span className="font-medium">{project.name}</span>
                  </span>
                  <Badge variant="outline">{project.currentPhase}</Badge>
                </Link>
              ))}
            </CardContent>
          )}
        </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ciclo de vida do projeto</CardTitle>
            <CardDescription>Fases do template MICI (referência).</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {PROJECT_PHASES.map((phase) => (
              <Badge key={phase.code} variant="outline" title={phase.name}>
                {phase.code} · {phase.name}
              </Badge>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Port gates</CardTitle>
            <CardDescription>
              Critérios e evidências obrigatórios por gate (BR-001/BR-002) — definidos por
              template de projeto.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {PROJECT_GATES.map((gate) => (
              <Badge key={gate.code} variant="secondary" title={gate.name}>
                {gate.code} · {gate.name}
              </Badge>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
