// RBAC (§9.1, §111): 18 papéis × 25 módulos × ações VIEW..ADMIN.
// A matriz é declarada como dados e expandida para códigos "modulo:acao".
// Padrão de código de permissão: `${module}:${action}` (§9.2).

export const ACTIONS = [
  "VIEW",
  "CREATE",
  "EDIT",
  "APPROVE",
  "REJECT",
  "DELETE",
  "EXPORT",
  "ADMIN",
] as const;

export type Action = (typeof ACTIONS)[number];

export const MODULES = [
  "PROJECT",
  "REQUIREMENT",
  "WBS",
  "SCHEDULE",
  "COST",
  "CONTRACT",
  "PROCUREMENT",
  "QUALITY",
  "SAFETY",
  "SUSTAINABILITY",
  "FIELD",
  "DOCUMENT",
  "RISK",
  "CHANGE",
  "GATE",
  "REPORT",
  "DASHBOARD",
  "AUDIT",
  "USER",
  "ROLE",
  "ORGANIZATION",
  "NOTIFICATION",
  "INTEGRATION",
  "SETTING",
  "INVOICE",
] as const;

export type Module = (typeof MODULES)[number];

export const ROLE_CODES = [
  "ADMIN",
  "PMO",
  "SPONSOR",
  "PROJECT_MANAGER",
  "SITE_COORDINATOR",
  "ENGINEERING",
  "ARCHITECTURE",
  "PROCUREMENT",
  "FINANCE",
  "QUALITY",
  "SAFETY",
  "SUSTAINABILITY",
  "SUPPLIER",
  "DESIGNER",
  "CLIENT",
  "RESPONSIBLE_TECHNICAL",
  "AUDITOR",
  "VIEWER",
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export const ROLE_NAMES_PT: Record<RoleCode, string> = {
  ADMIN: "Administrador",
  PMO: "PMO",
  SPONSOR: "Patrocinador",
  PROJECT_MANAGER: "Gerente de Projeto",
  SITE_COORDINATOR: "Coordenador de Obra",
  ENGINEERING: "Engenharia",
  ARCHITECTURE: "Arquitetura",
  PROCUREMENT: "Compras",
  FINANCE: "Financeiro",
  QUALITY: "Qualidade",
  SAFETY: "Segurança",
  SUSTAINABILITY: "Sustentabilidade",
  SUPPLIER: "Fornecedor",
  DESIGNER: "Projetista",
  CLIENT: "Cliente",
  RESPONSIBLE_TECHNICAL: "Responsável Técnico",
  AUDITOR: "Auditor",
  VIEWER: "Somente Leitura",
};

export interface RoleGrant {
  modules: readonly Module[] | "*";
  actions: readonly Action[] | "*";
}

// Matriz de permissões por papel (dados — alterar aqui altera autorização).
export const ROLE_GRANTS: Record<RoleCode, RoleGrant[]> = {
  ADMIN: [{ modules: "*", actions: "*" }],
  PMO: [
    {
      modules: [
        "PROJECT",
        "REQUIREMENT",
        "WBS",
        "SCHEDULE",
        "COST",
        "RISK",
        "CHANGE",
        "GATE",
        "REPORT",
        "DASHBOARD",
        "QUALITY",
        "SAFETY",
        "FIELD",
        "DOCUMENT",
        "CONTRACT",
        "PROCUREMENT",
        "INVOICE",
      ],
      actions: ["VIEW", "CREATE", "EDIT", "APPROVE", "REJECT", "DELETE", "EXPORT"],
    },
    { modules: ["USER", "ROLE", "ORGANIZATION", "SETTING", "AUDIT", "NOTIFICATION"], actions: ["VIEW", "CREATE", "EDIT", "ADMIN", "EXPORT"] },
  ],
  SPONSOR: [
    { modules: ["DASHBOARD", "REPORT"], actions: ["VIEW", "EXPORT"] },
    { modules: ["PROJECT", "GATE", "CHANGE", "COST", "RISK"], actions: ["VIEW", "APPROVE", "REJECT"] },
    { modules: ["DOCUMENT", "REQUIREMENT", "WBS", "SCHEDULE", "CONTRACT"], actions: ["VIEW"] },
  ],
  PROJECT_MANAGER: [
    {
      modules: ["PROJECT", "WBS", "SCHEDULE", "COST", "RISK", "CHANGE", "GATE", "FIELD", "DOCUMENT", "REPORT", "DASHBOARD", "INVOICE"],
      actions: ["VIEW", "CREATE", "EDIT", "APPROVE", "REJECT", "DELETE", "EXPORT"],
    },
    { modules: ["REQUIREMENT", "QUALITY", "SAFETY", "CONTRACT", "PROCUREMENT"], actions: ["VIEW", "CREATE", "EDIT", "APPROVE", "REJECT"] },
    { modules: ["USER", "NOTIFICATION"], actions: ["VIEW"] },
  ],
  SITE_COORDINATOR: [
    { modules: ["FIELD", "QUALITY", "SAFETY"], actions: ["VIEW", "CREATE", "EDIT"] },
    { modules: ["PROJECT", "WBS", "SCHEDULE", "DOCUMENT", "DASHBOARD", "RISK", "REPORT"], actions: ["VIEW"] },
  ],
  ENGINEERING: [
    { modules: ["REQUIREMENT", "WBS", "SCHEDULE", "DOCUMENT"], actions: ["VIEW", "CREATE", "EDIT"] },
    { modules: ["PROJECT", "COST", "RISK", "GATE", "CHANGE", "DASHBOARD", "QUALITY"], actions: ["VIEW"] },
  ],
  ARCHITECTURE: [
    { modules: ["REQUIREMENT", "WBS", "DOCUMENT"], actions: ["VIEW", "CREATE", "EDIT"] },
    { modules: ["PROJECT", "SCHEDULE", "COST", "GATE", "DASHBOARD"], actions: ["VIEW"] },
  ],
  PROCUREMENT: [
    { modules: ["PROCUREMENT", "CONTRACT"], actions: ["VIEW", "CREATE", "EDIT"] },
    { modules: ["COST", "INVOICE", "DOCUMENT", "PROJECT", "DASHBOARD", "WBS"], actions: ["VIEW"] },
  ],
  FINANCE: [
    { modules: ["COST", "INVOICE"], actions: ["VIEW", "CREATE", "EDIT", "APPROVE", "REJECT", "EXPORT"] },
    { modules: ["CONTRACT", "PROCUREMENT", "REPORT", "PROJECT", "DASHBOARD"], actions: ["VIEW"] },
  ],
  QUALITY: [
    { modules: ["QUALITY", "FIELD"], actions: ["VIEW", "CREATE", "EDIT", "APPROVE", "REJECT"] },
    { modules: ["PROJECT", "REQUIREMENT", "DOCUMENT", "REPORT", "DASHBOARD"], actions: ["VIEW"] },
  ],
  SAFETY: [
    { modules: ["SAFETY", "FIELD"], actions: ["VIEW", "CREATE", "EDIT", "APPROVE", "REJECT"] },
    { modules: ["PROJECT", "DOCUMENT", "REPORT", "DASHBOARD"], actions: ["VIEW"] },
  ],
  SUSTAINABILITY: [
    { modules: ["SUSTAINABILITY", "QUALITY", "FIELD"], actions: ["VIEW", "CREATE", "EDIT"] },
    { modules: ["PROJECT", "DOCUMENT", "REPORT", "DASHBOARD"], actions: ["VIEW"] },
  ],
  SUPPLIER: [
    { modules: ["PROCUREMENT", "CONTRACT", "DOCUMENT"], actions: ["VIEW"] },
    { modules: ["FIELD", "QUALITY"], actions: ["VIEW", "CREATE"] },
  ],
  DESIGNER: [
    { modules: ["REQUIREMENT", "DOCUMENT"], actions: ["VIEW", "CREATE", "EDIT"] },
    { modules: ["PROJECT", "WBS", "SCHEDULE", "DASHBOARD"], actions: ["VIEW"] },
  ],
  CLIENT: [
    { modules: ["DASHBOARD", "REPORT", "PROJECT", "GATE", "DOCUMENT"], actions: ["VIEW"] },
  ],
  RESPONSIBLE_TECHNICAL: [
    { modules: ["QUALITY", "GATE", "DOCUMENT"], actions: ["VIEW", "APPROVE", "REJECT", "EDIT"] },
    { modules: ["PROJECT", "REQUIREMENT", "SAFETY", "REPORT", "DASHBOARD"], actions: ["VIEW"] },
  ],
  AUDITOR: [{ modules: "*", actions: ["VIEW", "EXPORT"] }],
  VIEWER: [{ modules: "*", actions: ["VIEW"] }],
};

export function permissionCode(module: Module | string, action: Action): string {
  return `${module}:${action}`;
}

// Expande os grants de um papel em códigos "modulo:acao".
export function expandRolePermissions(roleCode: RoleCode): string[] {
  const grants = ROLE_GRANTS[roleCode] ?? [];
  const codes = new Set<string>();
  for (const grant of grants) {
    const modules = grant.modules === "*" ? MODULES : grant.modules;
    const actions = grant.actions === "*" ? ACTIONS : grant.actions;
    for (const mod of modules) {
      for (const action of actions) {
        codes.add(permissionCode(mod, action));
      }
    }
  }
  return [...codes];
}

// Catálogo completo de permissões (seed da tabela permissions).
export function allPermissionCodes(): string[] {
  const codes: string[] = [];
  for (const mod of MODULES) {
    for (const action of ACTIONS) {
      codes.push(permissionCode(mod, action));
    }
  }
  return codes;
}

export type PermissionSource = string[] | ReadonlySet<string>;

export function can(source: PermissionSource, module: Module | string, action: Action): boolean {
  const code = permissionCode(module, action);
  if (Array.isArray(source)) {
    return source.includes("*:*") || source.includes(code);
  }
  return source.has("*:*") || source.has(code);
}

export function toPermissionSet(source: PermissionSource): ReadonlySet<string> {
  return source instanceof Set ? source : new Set(source);
}
