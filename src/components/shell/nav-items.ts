import {
  LayoutDashboard,
  FolderKanban,
  UsersRound,
  LayoutTemplate,
  FileText,
  CalendarRange,
  Coins,
  TriangleAlert,
  FileBarChart2,
  Users,
  KeyRound,
  ScrollText,
  Milestone,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href?: string;
  icon: LucideIcon;
  soon?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

// Navegação do shell (§71). Itens sem href aparecem desabilitados até as
// fases entregarem as rotas correspondentes.
export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Geral",
    items: [{ label: "Painel", href: "/painel", icon: LayoutDashboard }],
  },
  {
    title: "Portfólio",
    items: [
      { label: "Projetos", href: "/projetos", icon: FolderKanban },
      { label: "Clientes", href: "/clientes", icon: UsersRound },
      { label: "Templates", href: "/templates", icon: LayoutTemplate },
      { label: "Requisitos", icon: FileText, soon: true },
      { label: "Cronograma", icon: CalendarRange, soon: true },
      { label: "Custos", icon: Coins, soon: true },
      { label: "Riscos", icon: TriangleAlert, soon: true },
      { label: "Relatórios", icon: FileBarChart2, soon: true },
    ],
  },
  {
    title: "Administração",
    items: [
      { label: "Usuários", href: "/administracao/usuarios", icon: Users },
      { label: "Papéis e permissões", href: "/administracao/papeis", icon: KeyRound },
      { label: "Gates e critérios", href: "/administracao/gates", icon: Milestone },
      { label: "Auditoria", href: "/administracao/auditoria", icon: ScrollText },
      { label: "Configurações", icon: Settings, soon: true },
    ],
  },
];
