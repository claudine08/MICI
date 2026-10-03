import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  CalendarRange,
  Coins,
  TriangleAlert,
  FileBarChart2,
  Users,
  KeyRound,
  ScrollText,
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
      { label: "Projetos", icon: FolderKanban, soon: true },
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
      { label: "Usuários", icon: Users, soon: true },
      { label: "Papéis e permissões", icon: KeyRound, soon: true },
      { label: "Auditoria", icon: ScrollText, soon: true },
      { label: "Configurações", icon: Settings, soon: true },
    ],
  },
];
