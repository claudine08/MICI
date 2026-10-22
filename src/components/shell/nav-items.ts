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
      { label: "Requisitos", href: "/requisitos", icon: FileText },
      { label: "Cronograma", href: "/cronograma", icon: CalendarRange },
      { label: "Orçamento de cozinha", href: "/orcamento", icon: ChefHat },
      { label: "Custos", href: "/custos", icon: Coins },
      { label: "Documentos", href: "/documentos", icon: FolderOpen },
      { label: "Riscos", href: "/riscos", icon: TriangleAlert },
      { label: "Mudanças", href: "/mudancas", icon: GitPullRequestArrow },
      { label: "Campo", href: "/campo", icon: HardHat },
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
