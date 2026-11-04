import {
  LayoutDashboard,
  FolderKanban,
  UsersRound,
  LayoutTemplate,
  FileText,
  CalendarRange,
  ChefHat,
  Coins,
  FolderOpen,
  TriangleAlert,
  GitPullRequestArrow,
  FileBarChart2,
  Users,
  KeyRound,
  ScrollText,
  Milestone,
  Settings,
  HardHat,
  ClipboardCheck,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";
import type { Action, Module } from "@/core/rbac";

export interface NavItem {
  label: string;
  href?: string;
  icon: LucideIcon;
  soon?: boolean;
  /** Permissão mínima para o item aparecer na navegação (perfil do usuário). */
  permission?: { module: Module; action: Action };
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

// Navegação do shell (§71). Itens sem href aparecem desabilitados até as
// fases entregarem as rotas correspondentes.
// A visibilidade de cada item segue a permissão do perfil do usuário
// (RBAC §9.1): quem não tem `module:ACTION` não enxerga o item — as páginas
// continuam guardadas no servidor (can()/assertPermission).
export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Geral",
    items: [
      { label: "Painel", href: "/painel", icon: LayoutDashboard, permission: { module: "DASHBOARD", action: "VIEW" } },
      { label: "Executivo", href: "/executivo", icon: LayoutDashboard, permission: { module: "DASHBOARD", action: "VIEW" } },
      { label: "IA", href: "/ai", icon: LayoutDashboard, permission: { module: "AI", action: "VIEW" } },
    ],
  },
  {
    title: "Portfólio",
    items: [
      { label: "Projetos", href: "/projetos", icon: FolderKanban, permission: { module: "PROJECT", action: "VIEW" } },
      { label: "Clientes", href: "/clientes", icon: UsersRound, permission: { module: "PROJECT", action: "VIEW" } },
      { label: "Templates", href: "/templates", icon: LayoutTemplate, permission: { module: "PROJECT", action: "VIEW" } },
      { label: "Requisitos", href: "/requisitos", icon: FileText, permission: { module: "REQUIREMENT", action: "VIEW" } },
      { label: "Cronograma", href: "/cronograma", icon: CalendarRange, permission: { module: "SCHEDULE", action: "VIEW" } },
      { label: "Orçamento de cozinha", href: "/orcamento", icon: ChefHat, permission: { module: "COST", action: "VIEW" } },
      { label: "Custos", href: "/custos", icon: Coins, permission: { module: "COST", action: "VIEW" } },
      { label: "Documentos", href: "/documentos", icon: FolderOpen, permission: { module: "DOCUMENT", action: "VIEW" } },
      { label: "Riscos", href: "/riscos", icon: TriangleAlert, permission: { module: "RISK", action: "VIEW" } },
      { label: "Mudanças", href: "/mudancas", icon: GitPullRequestArrow, permission: { module: "CHANGE", action: "VIEW" } },
      { label: "Campo", href: "/campo", icon: HardHat, permission: { module: "FIELD", action: "VIEW" } },
      { label: "Qualidade", href: "/qualidade", icon: ClipboardCheck, permission: { module: "QUALITY", action: "VIEW" } },
      { label: "Suprimentos", href: "/suprimentos", icon: ShoppingCart, permission: { module: "PROCUREMENT", action: "VIEW" } },
      { label: "Relatórios", icon: FileBarChart2, soon: true, permission: { module: "REPORT", action: "VIEW" } },
    ],
  },
  {
    title: "Administração",
    items: [
      { label: "Usuários", href: "/administracao/usuarios", icon: Users, permission: { module: "USER", action: "VIEW" } },
      { label: "Papéis e permissões", href: "/administracao/papeis", icon: KeyRound, permission: { module: "ROLE", action: "VIEW" } },
      { label: "Gates e critérios", href: "/administracao/gates", icon: Milestone, permission: { module: "GATE", action: "VIEW" } },
      { label: "Auditoria", href: "/administracao/auditoria", icon: ScrollText, permission: { module: "AUDIT", action: "VIEW" } },
      { label: "Configurações", icon: Settings, soon: true, permission: { module: "SETTING", action: "VIEW" } },
    ],
  },
];
