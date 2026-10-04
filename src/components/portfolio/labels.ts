import type { BadgeProps } from "@/components/ui/badge";

// Rótulos/variantes de exibição — portfólio e gates (pt-BR).

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

export const PROJECT_STATUS_LABELS: Record<string, { label: string; variant: BadgeVariant }> = {
  DRAFT: { label: "Rascunho", variant: "secondary" },
  QUALIFICATION: { label: "Qualificação", variant: "default" },
  ACTIVE: { label: "Ativo", variant: "success" },
  ON_HOLD: { label: "Suspenso", variant: "warning" },
  COMPLETED: { label: "Concluído", variant: "success" },
  CANCELLED: { label: "Cancelado", variant: "destructive" },
  ARCHIVED: { label: "Arquivado", variant: "secondary" },
};

export const GATE_STATUS_LABELS: Record<string, { label: string; variant: BadgeVariant }> = {
  NOT_STARTED: { label: "Não iniciado", variant: "secondary" },
  IN_PROGRESS: { label: "Em andamento", variant: "default" },
  SUBMITTED: { label: "Enviado", variant: "default" },
  UNDER_REVIEW: { label: "Em análise", variant: "warning" },
  APPROVED: { label: "Aprovado", variant: "success" },
  REJECTED: { label: "Rejeitado", variant: "destructive" },
  WAIVED: { label: "Dispensado", variant: "secondary" },
};

export const PROJECT_PHASES = [
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

export function phaseName(code: string): string | null {
  return PROJECT_PHASES.find((phase) => phase.code === code)?.name ?? null;
}

export const GATE_ACTIONS_LABELS: Record<string, string> = {
  start: "Iniciar",
  submit: "Enviar para análise",
  analyze: "Iniciar análise",
  approve: "Aprovar",
  reject: "Rejeitar",
  waive: "Dispensar",
};
